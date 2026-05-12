import { describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "../../db/seed.ts";
import { createTestOrm } from "../../test-utils/db.ts";
import { AppNotFoundError, AppValidationError } from "../errors.ts";
import { insertRepoTreeEntry, registerRepo } from "./commands.ts";
import {
  getRepo,
  getRepoBranchesPage,
  getRepoCommitDetail,
  getRepoCommitsPage,
  isRepoWriteOpsEnabled,
  listProjectRepoCards,
  listRepoPageRows,
  listRepoTree,
  listRepos,
} from "./queries.ts";
import {
  enqueueRepoSync,
  getTrpcRepoStatus,
  registerTrpcRepo,
  syncTrpcRepo,
  unregisterTrpcRepo,
} from "./trpc-adapter.ts";

const ctx = { orgId: DEFAULT_ORG_ID, userId: "user-repos", projectId: "22222222-2222-4222-8222-222222222222" };

describe("application repos", () => {
  test("handles CRUD, not-found, validation, and scoping", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const repo = await registerRepo(em, ctx, { slug: "fulcrum", name: "Fulcrum", kind: "local", localPath: "/repo" });
      await insertRepoTreeEntry(em, ctx, { repoId: repo.id, commitSha: "abc", path: "apps/cli/src/main.ts", kind: "file" });
      expect(await listRepos(em, ctx)).toHaveLength(1);
      expect(await listRepoTree(em, ctx, { repoId: repo.id, commitSha: "abc" })).toHaveLength(1);
      await expect(getRepo(em, ctx, repo.id)).resolves.toMatchObject({ id: repo.id });
      await expect(getRepo(em, ctx, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).rejects.toBeInstanceOf(AppNotFoundError);
      await expect(registerRepo(em, ctx, { slug: "", name: "", kind: "local" })).rejects.toBeInstanceOf(AppValidationError);
    } finally {
      await db.close();
    }
  });

  test("tRPC facade derives local and remote repo fields", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const local = await registerTrpcRepo(em, ctx, { kind: "local", path: "/tmp/Fulcrum App" });
      const remote = await registerTrpcRepo(em, ctx, { kind: "remote", url: "git@github.com:moabualruz/fulcrum.git" });

      expect(local).toMatchObject({
        name: "Fulcrum App",
        slug: "Fulcrum App",
        kind: "local",
        localPath: "/tmp/Fulcrum App",
        remoteUrl: null,
        archived: false,
      });
      expect(remote).toMatchObject({
        name: "fulcrum",
        slug: "fulcrum",
        kind: "remote",
        localPath: null,
        remoteUrl: "git@github.com:moabualruz/fulcrum.git",
        archived: false,
      });
    } finally {
      await db.close();
    }
  });

  test("tRPC facade sync and unregister mutate repo and record events", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const repo = await registerTrpcRepo(em, ctx, { kind: "local", path: "/tmp/fulcrum" });

      const synced = await syncTrpcRepo(em, ctx, repo.id);
      const archived = await unregisterTrpcRepo(em, ctx, repo.id);
      const events = await em.getKysely<any>()
        .selectFrom("events")
        .select(["verb", "subject_id as subjectId"])
        .where("org_id", "=", ctx.orgId)
        .where("subject_id", "=", repo.id)
        .orderBy("created_at", "asc")
        .execute() as Array<{ verb: string; subjectId: string }>;

      expect(synced).toMatchObject({ id: repo.id, syncStatus: "syncing" });
      expect(archived).toMatchObject({ id: repo.id, archived: true });
      expect(events.map((event) => event.verb)).toEqual([
        "repo.registered",
        "repo.sync.requested",
        "repo.unregistered",
      ]);
    } finally {
      await db.close();
    }
  });

  test("tRPC facade maps repo status buckets", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const staleNoSync = await registerTrpcRepo(em, ctx, { kind: "local", path: "/tmp/stale-no-sync" });
      const synced = await registerTrpcRepo(em, ctx, { kind: "local", path: "/tmp/synced" });
      const staleOld = await registerTrpcRepo(em, ctx, { kind: "local", path: "/tmp/stale-old" });
      const running = await registerTrpcRepo(em, ctx, { kind: "local", path: "/tmp/running" });
      const failed = await registerTrpcRepo(em, ctx, { kind: "local", path: "/tmp/failed" });

      await em.getKysely<any>().updateTable("repos").set({ last_sync_at: new Date() }).where("id", "=", synced.id).execute();
      await em.getKysely<any>().updateTable("repos").set({ last_sync_at: new Date(Date.now() - 31 * 60 * 1_000) }).where("id", "=", staleOld.id).execute();
      await em.getKysely<any>().updateTable("repos").set({ sync_status: "syncing" }).where("id", "=", running.id).execute();
      await em.getKysely<any>().updateTable("repos").set({ sync_status: "error" }).where("id", "=", failed.id).execute();
      em.clear();

      await expect(getTrpcRepoStatus(em, ctx, staleNoSync.id)).resolves.toMatchObject({ status: "stale" });
      await expect(getTrpcRepoStatus(em, ctx, synced.id)).resolves.toMatchObject({ status: "synced" });
      await expect(getTrpcRepoStatus(em, ctx, staleOld.id)).resolves.toMatchObject({ status: "stale" });
      await expect(getTrpcRepoStatus(em, ctx, running.id)).resolves.toMatchObject({ status: "running" });
      await expect(getTrpcRepoStatus(em, ctx, failed.id)).resolves.toMatchObject({ status: "failed" });
    } finally {
      await db.close();
    }
  });

  test("tRPC facade enqueue sync uses injected queue and existing DTO", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const repo = await registerTrpcRepo(em, ctx, { kind: "remote", url: "https://github.com/moabualruz/fulcrum.git" });
      const calls: unknown[] = [];
      const queue = {
        async addJob(name: string, payload: { repoId: string }, options: { jobKey: string }) {
          calls.push({ name, payload, options });
        },
      };

      const result = await enqueueRepoSync(em, ctx, repo.id, queue);

      expect(result).toEqual({
        repoId: repo.id,
        status: "queued",
        taskName: "repo.sync.remote",
        jobKey: `repo.sync.remote:${repo.id}`,
      });
      expect(calls).toEqual([{
        name: "repo.sync.remote",
        payload: { repoId: repo.id },
        options: { jobKey: `repo.sync.remote:${repo.id}` },
      }]);
      await expect(getTrpcRepoStatus(em, ctx, repo.id)).resolves.toMatchObject({ status: "running" });
    } finally {
      await db.close();
    }
  });

  test("repo page read models derive cards, task counts, branches, commits, and write gate from real rows", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      await em.getConnection().execute(
        `INSERT INTO projects (id, org_id, slug, name, created_at, updated_at)
         VALUES (?, ?, 'repo-page-project', 'Repo Page Project', now(), now())`,
        [ctx.projectId, DEFAULT_ORG_ID],
      );
      const repo = await registerRepo(em, ctx, {
        slug: "read-model-repo",
        name: "Read Model Repo",
        kind: "local",
        localPath: "/tmp/read-model-repo",
      });
      const taskId = crypto.randomUUID();
      const commitSha = "abc1234567890abcdef";
      await em.getConnection().execute(
        `INSERT INTO tasks (id, org_id, project_id, repo_id, title, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'Repo task', 'pending', now(), now())`,
        [taskId, DEFAULT_ORG_ID, ctx.projectId, repo.id],
      );
      await em.getConnection().execute(
        `INSERT INTO repo_commits (id, org_id, repo_id, sha, message, author, committed_at)
         VALUES (?, ?, ?, ?, ?, ?, now())`,
        [crypto.randomUUID(), DEFAULT_ORG_ID, repo.id, commitSha, "feat: real commit\n\nbody", "Mona"],
      );
      await em.getConnection().execute(
        `INSERT INTO repo_branches (id, org_id, repo_id, name, sha, is_default)
         VALUES
           (?, ?, ?, 'main', ?, true),
           (?, ?, ?, 'feature', ?, false)`,
        [crypto.randomUUID(), DEFAULT_ORG_ID, repo.id, commitSha, crypto.randomUUID(), DEFAULT_ORG_ID, repo.id, "def456"],
      );
      await em.getConnection().execute(
        `UPDATE repos SET current_branch = 'main', default_branch = 'main', last_sync_at = now(), last_touched_at = now() WHERE id = ?`,
        [repo.id],
      );

      await expect(listProjectRepoCards(em, ctx)).resolves.toEqual([
        expect.objectContaining({ id: repo.id, name: "Read Model Repo", kind: "local", currentBranch: "main", syncStatus: "idle" }),
      ]);
      await expect(listRepoPageRows(em, ctx)).resolves.toEqual([
        expect.objectContaining({ id: repo.id, recentCommit: "feat: real commit", openTaskCount: 1, health: "healthy", branch: "main" }),
      ]);
      await expect(isRepoWriteOpsEnabled(em, ctx)).resolves.toBe(false);
      await em.getConnection().execute(
        `INSERT INTO feature_flags (id, org_id, flag, enabled, created_at)
         VALUES (?, ?, 'repo-write-ops', true, now())`,
        [crypto.randomUUID(), DEFAULT_ORG_ID],
      );
      await expect(getRepoBranchesPage(em, ctx, repo.id)).resolves.toMatchObject({
        repo: { id: repo.id, currentBranch: "main" },
        writeOpsEnabled: true,
        branches: [
          { name: "feature", headSha: "def456", isCurrent: false, isDefault: false },
          { name: "main", headSha: commitSha, isCurrent: true, isDefault: true },
        ],
      });
      await expect(getRepoCommitsPage(em, ctx, { repoId: repo.id, page: 1, pageSize: 25 })).resolves.toMatchObject({
        repo: { id: repo.id, slug: "read-model-repo", default_branch: "main" },
        commits: [],
        total: 0,
        totalPages: 1,
      });
      await expect(getRepoCommitDetail(em, ctx, { repoId: repo.id, sha: commitSha, view: "unified" })).resolves.toMatchObject({
        repo: { id: repo.id, name: "Read Model Repo" },
        commit: { sha: commitSha, subject: "feat: real commit", author: "Mona" },
        diff: { raw: "", filesChanged: 0, insertions: 0, deletions: 0 },
      });
    } finally {
      await db.close();
    }
  });
});
