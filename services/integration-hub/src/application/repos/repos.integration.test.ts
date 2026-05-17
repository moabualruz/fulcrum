import { describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm } from "@test-support/application-database.ts";
import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { insertRepoTreeEntry, registerRepo } from "@integration-hub/application/repos/commands.ts";
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
} from "@integration-hub/application/repos/queries.ts";
import {
  enqueueRepositorySync,
  getRepositoryStatus,
  registerRepository,
  requestRepositorySync,
  unregisterRepository,
} from "@integration-hub/application/repos/repository-operations.ts";

const ctx = { orgId: DEFAULT_ORG_ID, userId: "user-repos", projectId: "22222222-2222-4222-8222-222222222222" };

describe("application repos", () => {
  test("handles CRUD, not-found, validation, and scoping", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
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

  test("repository operations derive local and remote repo fields", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const local = await registerRepository(em, ctx, { kind: "local", path: "/tmp/Fulcrum App" });
      const remote = await registerRepository(em, ctx, { kind: "remote", url: "git@github.com:moabualruz/fulcrum.git" });

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

  test("repository operations sync and unregister mutate repo and record events", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const repo = await registerRepository(em, ctx, { kind: "local", path: "/tmp/fulcrum" });

      const synced = await requestRepositorySync(em, ctx, repo.id);
      const archived = await unregisterRepository(em, ctx, repo.id);
      const events = await em.getConnection().execute<Array<{ verb: string; subjectId: string }>>(
        `SELECT verb, subject_id AS "subjectId"
           FROM events
          WHERE org_id = ?
            AND subject_id = ?
          ORDER BY created_at ASC`,
        [ctx.orgId, repo.id],
      );

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

  test("repository operations map repo status buckets", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const staleNoSync = await registerRepository(em, ctx, { kind: "local", path: "/tmp/stale-no-sync" });
      const synced = await registerRepository(em, ctx, { kind: "local", path: "/tmp/synced" });
      const staleOld = await registerRepository(em, ctx, { kind: "local", path: "/tmp/stale-old" });
      const running = await registerRepository(em, ctx, { kind: "local", path: "/tmp/running" });
      const failed = await registerRepository(em, ctx, { kind: "local", path: "/tmp/failed" });

      await em.getConnection().execute(`UPDATE repos SET last_sync_at = ? WHERE id = ?`, [new Date(), synced.id]);
      await em.getConnection().execute(`UPDATE repos SET last_sync_at = ? WHERE id = ?`, [new Date(Date.now() - 31 * 60 * 1_000), staleOld.id]);
      await em.getConnection().execute(`UPDATE repos SET sync_status = 'syncing' WHERE id = ?`, [running.id]);
      await em.getConnection().execute(`UPDATE repos SET sync_status = 'error' WHERE id = ?`, [failed.id]);
      em.clear();

      await expect(getRepositoryStatus(em, ctx, staleNoSync.id)).resolves.toMatchObject({ status: "stale" });
      await expect(getRepositoryStatus(em, ctx, synced.id)).resolves.toMatchObject({ status: "synced" });
      await expect(getRepositoryStatus(em, ctx, staleOld.id)).resolves.toMatchObject({ status: "stale" });
      await expect(getRepositoryStatus(em, ctx, running.id)).resolves.toMatchObject({ status: "running" });
      await expect(getRepositoryStatus(em, ctx, failed.id)).resolves.toMatchObject({ status: "failed" });
    } finally {
      await db.close();
    }
  });

  test("repository operations enqueue sync uses injected queue and existing DTO", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const repo = await registerRepository(em, ctx, { kind: "remote", url: "https://github.com/moabualruz/fulcrum.git" });
      const calls: unknown[] = [];
      const queue = {
        async addJob(name: string, payload: { repoId: string }, options: { jobKey: string }) {
          calls.push({ name, payload, options });
        },
      };

      const result = await enqueueRepositorySync(em, ctx, repo.id, queue);

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
      await expect(getRepositoryStatus(em, ctx, repo.id)).resolves.toMatchObject({ status: "running" });
    } finally {
      await db.close();
    }
  });

  test("repo page read models derive cards, task counts, branches, commits, and write gate from real rows", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
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
