import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { createContext } from "../context.ts";
import { reposRouter } from "./repos.ts";
import { createTestContainer, createTestOrm } from "@test-support/index.ts";

function session(userId: string, orgId: string) {
  return {
    id: "repos-router-session",
    userId,
    orgId,
    activeOrganizationId: orgId,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "repos-router-token",
    ipAddress: null,
    userAgent: null,
  };
}

describe("reposRouter", () => {
  test("delegates repo lifecycle behavior to application facade", async () => {
    const db = await createTestOrm();
    try {
      const queueCalls: unknown[] = [];
      const container = createTestContainer(db);
      container.bind({
        provide: "repoSyncQueue",
        useValue: {
          async addJob(name: string, payload: { repoId: string }, options: { jobKey: string }) {
            queueCalls.push({ name, payload, options });
          },
        },
      });
      const caller = reposRouter.createCaller(createContext({
        session: session(db.seed.userId, db.seed.orgId),
        orgId: db.seed.orgId,
        userId: db.seed.userId,
        em: db.em,
        container,
      }));

      const registered = await caller.register({ kind: "remote", url: "https://github.com/moabualruz/fulcrum.git" });
      const listed = await caller.list({});
      const fetched = await caller.get({ id: registered.id });
      const synced = await caller.sync({ id: registered.id });
      const queued = await caller.syncRepo({ repoId: registered.id });
      const status = await caller.statusRepo({ repoId: registered.id });
      const archived = await caller.unregister({ id: registered.id });
      const events = await db.em.query(
        `SELECT verb FROM events WHERE org_id = $1 AND subject_id = $2 ORDER BY created_at ASC`,
        [db.seed.orgId, registered.id],
      ) as Array<{ verb: string }>;

      expect(listed.map((repo) => repo.id)).toContain(registered.id);
      expect(fetched).toMatchObject({ id: registered.id, slug: "fulcrum" });
      expect(synced).toMatchObject({ id: registered.id, syncStatus: "syncing" });
      expect(queued).toEqual({
        repoId: registered.id,
        status: "queued",
        taskName: "repo.sync.remote",
        jobKey: `repo.sync.remote:${registered.id}`,
      });
      expect(status).toMatchObject({ repoId: registered.id, status: "running" });
      expect(archived).toMatchObject({ id: registered.id, archived: true });
      expect(queueCalls).toEqual([{
        name: "repo.sync.remote",
        payload: { repoId: registered.id },
        options: { jobKey: `repo.sync.remote:${registered.id}` },
      }]);
      expect(events.map((event) => event.verb)).toEqual([
        "repo.registered",
        "repo.sync.requested",
        "repo.sync.requested",
        "repo.unregistered",
      ]);
    } finally {
      await db.close();
    }
  });

  test("router source stays a thin application adapter", () => {
    const source = readFileSync("apps/server/src/trpc/routers/repos.ts", "utf8");
    expect(source).toContain("repositoryOperations.");
    expect(source).not.toMatch(/ctx\.em|em\.find|em\.findOne|em\.create|em\.persist|em\.flush|em\.transactional/);
    expect(source).not.toMatch(/(?<!repositoryOperations)\.getRepository\(/);
    expect(source).not.toMatch(/RepoRepository|db\/entities\/repos\/Repo|db\/entities\/auth\/Org|db\/entities\/core\/Event/);
  });
});
