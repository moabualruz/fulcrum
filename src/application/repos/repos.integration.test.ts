import { describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "../../db/seed.ts";
import { createTestOrm } from "../../test-utils/db.ts";
import { AppNotFoundError, AppValidationError } from "../errors.ts";
import { insertRepoTreeEntry, registerRepo } from "./commands.ts";
import { getRepo, listRepoTree, listRepos } from "./queries.ts";
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
      await insertRepoTreeEntry(em, ctx, { repoId: repo.id, commitSha: "abc", path: "src/index.ts", kind: "file" });
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
});
