import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { Container } from "@needle-di/core";

import { createTestOrm } from "../../src/test-utils/db.ts";
import { Task } from "../../src/db/entities/tasks/Task.ts";
import { TaskRepository } from "../../src/db/repositories/tasks/TaskRepository.ts";
import { appRouter } from "../../src/trpc/router.ts";
import { createContext } from "../../src/trpc/context.ts";
import { t } from "../../src/trpc/trpc.ts";

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

function callerFor(repo: TaskRepository, orgId = ORG_ID) {
  const container = new Container();
  container.bind({ provide: TaskRepository, useValue: repo });

  return createCaller(
    createContext({
      session: mockSession(USER_ID, orgId) as unknown as import("better-auth").Session,
      orgId,
      userId: USER_ID,
      em: repo.getEntityManager() as unknown as import("@mikro-orm/postgresql").EntityManager,
      container,
    }),
  );
}

describe("tasks CRUD tRPC baseline", () => {
  test("create, list, get, update, and soft-delete tasks inside the caller org", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.fork().getRepository(Task) as TaskRepository;
      const caller = callerFor(repo);

      const created = await caller.tasks.create({
        title: "Write CRUD tests",
        description: "Baseline coverage",
        status: "todo",
        priority: 2,
        points: 3,
      });

      expect(created).toMatchObject({
        orgId: ORG_ID,
        title: "Write CRUD tests",
        description: "Baseline coverage",
        status: "todo",
        priority: 2,
        points: 3,
        deletedAt: null,
      });

      const listed = await caller.tasks.list();
      expect(listed.map((task) => task.id)).toEqual([created.id]);

      const fetched = await caller.tasks.get({ id: created.id });
      expect(fetched).toMatchObject({
        id: created.id,
        title: "Write CRUD tests",
      });

      const updated = await caller.tasks.update({
        id: created.id,
        title: "Ship CRUD baseline",
        description: null,
        status: "in_progress",
        priority: 1,
        points: null,
      });

      expect(updated).toMatchObject({
        id: created.id,
        title: "Ship CRUD baseline",
        description: null,
        status: "in_progress",
        priority: 1,
        points: null,
      });

      const deleted = await caller.tasks.delete({ id: created.id });
      expect(deleted).not.toBeNull();
      expect(deleted).toMatchObject({ id: created.id });
      expect(deleted!.deletedAt).toBeInstanceOf(Date);

      expect(await caller.tasks.list()).toEqual([]);
      expect(await caller.tasks.get({ id: created.id })).toBeNull();
      expect(await caller.tasks.list({ includeDeleted: true })).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  test("get, update, and delete reject tasks outside the caller org", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.fork().getRepository(Task) as TaskRepository;
      const caller = callerFor(repo);
      const otherOrgCaller = callerFor(repo, OTHER_ORG_ID);

      const created = await caller.tasks.create({
        title: "Org scoped task",
        status: "todo",
      });

      expect(await otherOrgCaller.tasks.get({ id: created.id })).toBeNull();
      expect(await otherOrgCaller.tasks.update({ id: created.id, title: "Nope" })).toBeNull();
      expect(await otherOrgCaller.tasks.delete({ id: created.id })).toBeNull();
      expect((await caller.tasks.get({ id: created.id }))?.title).toBe("Org scoped task");
    } finally {
      await db.close();
    }
  });

  test("tasks.list requires authentication", async () => {
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
      await caller.tasks.list();
    } catch (caught) {
      if (caught instanceof TRPCError) error = caught;
    }

    expect(error?.code).toBe("UNAUTHORIZED");
  });
});
