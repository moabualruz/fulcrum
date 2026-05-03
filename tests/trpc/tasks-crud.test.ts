import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { Container } from "@needle-di/core";

import { createTestOrm } from "../../src/test-utils/db.ts";
import { Event } from "../../src/db/entities/core/Event.ts";
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

describe("tasks subtasks and dependencies tRPC", () => {
  test("setParent rejects direct cycles and accepts deeper non-cycles", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.fork().getRepository(Task) as TaskRepository;
      const caller = callerFor(repo);

      const a = await caller.tasks.create({ title: "A" });
      const b = await caller.tasks.create({ title: "B" });
      const c = await caller.tasks.create({ title: "C" });

      await expect(caller.tasks.setParent({ taskId: b.id, parentId: a.id })).resolves
        .toMatchObject({ id: b.id, parentId: a.id });
      await expect(caller.tasks.setParent({ taskId: c.id, parentId: b.id })).resolves
        .toMatchObject({ id: c.id, parentId: b.id });

      await expect(caller.tasks.setParent({ taskId: a.id, parentId: c.id })).rejects
        .toMatchObject({ code: "CONFLICT", message: "Task parent cycle rejected." });

      const events = await repo.getEntityManager().find(Event, {
        org: ORG_ID,
        verb: "parent_changed",
        subjectKind: "task",
        subjectId: b.id,
      } as never);
      expect(events).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  test("listChildren returns direct children for a 3-level nesting tree", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.fork().getRepository(Task) as TaskRepository;
      const caller = callerFor(repo);

      const root = await caller.tasks.create({ title: "Root" });
      const child = await caller.tasks.create({ title: "Child" });
      const grandchild = await caller.tasks.create({ title: "Grandchild" });

      await caller.tasks.setParent({ taskId: child.id, parentId: root.id });
      await caller.tasks.setParent({ taskId: grandchild.id, parentId: child.id });

      expect((await caller.tasks.listChildren({ taskId: root.id })).map((task) => task.id))
        .toEqual([child.id]);
      expect((await caller.tasks.listChildren({ taskId: child.id })).map((task) => task.id))
        .toEqual([grandchild.id]);
      expect(await caller.tasks.listChildren({ taskId: grandchild.id })).toEqual([]);
    } finally {
      await db.close();
    }
  });

  test("setDependencies rejects circular blocks with typed error", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.fork().getRepository(Task) as TaskRepository;
      const caller = callerFor(repo);

      const a = await caller.tasks.create({ title: "A" });
      const b = await caller.tasks.create({ title: "B" });

      await expect(
        caller.tasks.setDependencies({
          taskId: a.id,
          dependencies: { blocks: [b.id], blocked_by: [] },
        }),
      ).resolves.toMatchObject({
        id: a.id,
        dependencies: { blocks: [b.id], blocked_by: [] },
      });

      await expect(
        caller.tasks.setDependencies({
          taskId: b.id,
          dependencies: { blocks: [a.id], blocked_by: [] },
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: "Task dependency cycle rejected.",
      });
    } finally {
      await db.close();
    }
  });

  test("setDependencies stores normalized directions and emits dependency_updated", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.fork().getRepository(Task) as TaskRepository;
      const caller = callerFor(repo);

      const blocked = await caller.tasks.create({ title: "Blocked" });
      const blocker = await caller.tasks.create({ title: "Blocker" });

      const updated = await caller.tasks.setDependencies({
        taskId: blocked.id,
        dependencies: { blocks: [], blocked_by: [blocker.id] },
      });

      expect(updated).toMatchObject({
        id: blocked.id,
        dependencies: { blocks: [], blocked_by: [blocker.id] },
      });

      const blockerRow = await caller.tasks.get({ id: blocker.id });
      expect(blockerRow).toMatchObject({
        id: blocker.id,
        dependencies: { blocks: [blocked.id], blocked_by: [] },
      });

      const events = await repo.getEntityManager().find(Event, {
        org: ORG_ID,
        verb: "dependency_updated",
        subjectKind: "task",
        subjectId: blocked.id,
      } as never);
      expect(events).toHaveLength(1);
    } finally {
      await db.close();
    }
  });
});
