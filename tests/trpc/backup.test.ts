import { describe, expect, test } from "bun:test";
import { Container } from "@needle-di/core";

import { createTestOrm } from "../../src/test-utils/db.ts";
import { Task } from "../../src/db/entities/tasks/Task.ts";
import { TaskRepository } from "../../src/db/repositories/tasks/TaskRepository.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";

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

function callerFor(repo: TaskRepository) {
  const container = new Container();
  container.bind({ provide: TaskRepository, useValue: repo });

  return createCaller(
    createContext({
      session: mockSession(USER_ID, ORG_ID) as unknown as import("better-auth").Session,
      orgId: ORG_ID,
      userId: USER_ID,
      em: repo.getEntityManager() as unknown as import("@mikro-orm/postgresql").EntityManager,
      container,
    }),
  );
}

describe("backup tRPC router", () => {
  test("create returns a DB dump blob and restore imports it", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em.fork();
      const repo = em.getRepository(Task) as TaskRepository;
      const caller = callerFor(repo);

      const created = await caller.tasks.create({
        title: "Back me up",
        status: "ready",
        priority: 1,
      });

      const backup = await caller.backup.create();
      expect(backup).toMatchObject({
        ok: true,
        format: "fulcrum.db-dump.v1",
      });
      expect(backup.dump).toEqual(expect.any(String));
      expect(backup.entityCounts.tasks).toBe(1);

      await caller.tasks.delete({ id: created.id });
      expect(await caller.tasks.list()).toHaveLength(0);

      const restored = await caller.backup.restore({ dump: backup.dump });
      expect(restored).toMatchObject({
        ok: true,
        format: "fulcrum.db-dump.v1",
      });
      expect(restored.entityCounts.tasks).toBe(1);

      const tasks = await caller.tasks.list();
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({
        id: created.id,
        title: "Back me up",
        status: "ready",
        priority: 1,
      });
    } finally {
      await db.close();
    }
  });
});
