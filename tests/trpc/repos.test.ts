import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";

import { Event } from "../../src/db/entities/core/Event.ts";
import { Org } from "../../src/db/entities/auth/Org.ts";
import { Repo } from "../../src/db/entities/repos/Repo.ts";
import { RepoRepository } from "../../src/db/repositories/repos/RepoRepository.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { createTestOrm } from "../../src/test-utils/db.ts";

const createCaller = t.createCallerFactory(appRouter);
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const OTHER_ORG_ID = "11111111-1111-4111-8111-111111111111";

function mockSession(userId: string, orgId: string) {
  return {
    id: `sess-${userId.slice(-8)}`,
    userId,
    orgId,
    activeOrganizationId: orgId,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: `tok-${userId.slice(-8)}`,
    ipAddress: null,
    userAgent: null,
  };
}

function callerFor(db: Awaited<ReturnType<typeof createTestOrm>>, orgId = ORG_ID) {
  const em = db.em.fork();
  return createCaller(
    createContext({
      session: mockSession(USER_ID, orgId) as unknown as import("better-auth").Session,
      orgId,
      userId: USER_ID,
      em,
      container: null,
    }),
  );
}

describe("repos tRPC procedures", () => {
  test("register creates local and remote repos and emits events", async () => {
    const db = await createTestOrm();
    try {
      const caller = callerFor(db);

      const local = await caller.repos.register({
        kind: "local",
        path: "/tmp/fulcrum-alpha",
      });
      const remote = await caller.repos.register({
        kind: "remote",
        url: "https://example.test/beta.git",
        name: "Beta Repo",
      });

      expect(local).toMatchObject({
        orgId: ORG_ID,
        name: "fulcrum-alpha",
        slug: "fulcrum-alpha",
        kind: "local",
        localPath: "/tmp/fulcrum-alpha",
        remoteUrl: null,
        archived: false,
        syncStatus: "idle",
      });
      expect(remote).toMatchObject({
        orgId: ORG_ID,
        name: "Beta Repo",
        slug: "beta",
        kind: "remote",
        localPath: null,
        remoteUrl: "https://example.test/beta.git",
      });

      const events = await db.em.fork().find(Event, {
        org: ORG_ID,
        verb: "repo.registered",
      } as never);
      expect(events.map((event) => event.subjectId).sort()).toEqual(
        [local.id, remote.id].sort(),
      );
    } finally {
      await db.close();
    }
  });

  test("list and get are org-scoped and hide archived repos by default", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.fork().getRepository(Repo) as RepoRepository;
      const now = new Date();
      repo.getEntityManager().persist(repo.getEntityManager().create(Org, {
        id: OTHER_ORG_ID,
        name: "Other Org",
        slug: "other-org",
        createdAt: now,
        updatedAt: now,
      }));
      await repo.getEntityManager().flush();
      const caller = callerFor(db);
      const otherCaller = callerFor(db, OTHER_ORG_ID);

      const alpha = repo.create({
        orgId: ORG_ID,
        name: "Alpha",
        slug: "alpha",
        kind: "local",
        localPath: "/work/alpha",
      });
      repo.create({
        orgId: OTHER_ORG_ID,
        name: "Other",
        slug: "other",
        kind: "remote",
        remoteUrl: "https://example.test/other.git",
      });
      await repo.archive({ orgId: ORG_ID, id: alpha.id });

      expect(await caller.repos.get({ id: alpha.id })).toMatchObject({
        id: alpha.id,
        orgId: ORG_ID,
        archived: true,
      });
      expect(await otherCaller.repos.get({ id: alpha.id })).toBeNull();
      expect(await caller.repos.list()).toEqual([]);
      expect((await caller.repos.list({ includeArchived: true })).map((row) => row.id))
        .toEqual([alpha.id]);
    } finally {
      await db.close();
    }
  });

  test("sync marks repo syncing and emits an event", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.fork().getRepository(Repo) as RepoRepository;
      const caller = callerFor(db);
      const alpha = repo.create({
        orgId: ORG_ID,
        name: "Alpha",
        slug: "alpha-sync",
        kind: "local",
      });
      await repo.getEntityManager().flush();

      const synced = await caller.repos.sync({ id: alpha.id });

      expect(synced).toMatchObject({
        id: alpha.id,
        syncStatus: "syncing",
      });
      const events = await db.em.fork().find(Event, {
        org: ORG_ID,
        verb: "repo.sync.requested",
        subjectKind: "repo",
        subjectId: alpha.id,
      } as never);
      expect(events).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  test("unregister archives repo and emits an event", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.fork().getRepository(Repo) as RepoRepository;
      const caller = callerFor(db);
      const alpha = repo.create({
        orgId: ORG_ID,
        name: "Alpha",
        slug: "alpha-remove",
        kind: "local",
      });
      await repo.getEntityManager().flush();

      const removed = await caller.repos.unregister({ id: alpha.id });

      expect(removed).toMatchObject({
        id: alpha.id,
        archived: true,
      });
      expect(await caller.repos.list()).toEqual([]);
      const events = await db.em.fork().find(Event, {
        org: ORG_ID,
        verb: "repo.unregistered",
        subjectKind: "repo",
        subjectId: alpha.id,
      } as never);
      expect(events).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  test("repos.list requires authentication", async () => {
    const caller = createCaller(
      createContext({
        session: null,
        orgId: null,
        userId: null,
        em: null,
        container: null,
      }),
    );

    let error: TRPCError | null = null;
    try {
      await caller.repos.list();
    } catch (caught) {
      if (caught instanceof TRPCError) error = caught;
    }

    expect(error?.code).toBe("UNAUTHORIZED");
  });
});
