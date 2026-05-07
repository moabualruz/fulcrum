import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { Container } from "@needle-di/core";

import { createTestOrm } from "../../src/test-utils/db.ts";
import { Event } from "../../src/db/entities/core/Event.ts";
import { MetricsCache } from "../../src/db/entities/tasks/MetricsCache.ts";
import { Task } from "../../src/db/entities/tasks/Task.ts";
import { TaskRepository } from "../../src/db/repositories/tasks/TaskRepository.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const createCaller = t.createCallerFactory(appRouter);
const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

function mockSession() {
  return {
    id: "sess-sprints",
    userId: USER_ID,
    orgId: ORG_ID,
    activeOrganizationId: ORG_ID,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-sprints",
    ipAddress: null,
    userAgent: null,
  };
}

function callerFor(repo: TaskRepository) {
  const container = new Container();
  container.bind({ provide: TaskRepository, useValue: repo });

  return createCaller(
    createContext({
      session: mockSession() as unknown as import("better-auth").Session,
      orgId: ORG_ID,
      userId: USER_ID,
      em: repo.getEntityManager() as unknown as import("@mikro-orm/postgresql").EntityManager,
      container,
    }),
  );
}

describe("sprints tRPC CRUD", () => {
  test("create validates date order and sets planned status", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.fork().getRepository(Task) as TaskRepository;
      const caller = callerFor(repo);

      await expect(
        caller.sprints.create({
          projectId: PROJECT_ID,
          name: "Bad sprint",
          startDate: new Date("2026-05-14"),
          endDate: new Date("2026-05-01"),
        }),
      ).rejects.toBeInstanceOf(TRPCError);

      const created = await caller.sprints.create({
        projectId: PROJECT_ID,
        name: "Sprint 1",
        goal: "Ship CRUD",
        startDate: new Date("2026-05-01"),
        endDate: new Date("2026-05-14"),
        capacityPoints: 21,
      });

      expect(created).toMatchObject({
        orgId: ORG_ID,
        projectId: PROJECT_ID,
        name: "Sprint 1",
        goal: "Ship CRUD",
        status: "planned",
        capacityPoints: 21,
      });
      expect((await caller.sprints.get({ id: created.id }))?.id).toBe(created.id);
      expect((await caller.sprints.list({ projectId: PROJECT_ID })).map((sprint) => sprint.id)).toEqual([created.id]);
    } finally {
      await db.close();
    }
  });

  test("start rejects second active sprint before hitting the DB constraint", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.fork().getRepository(Task) as TaskRepository;
      const caller = callerFor(repo);
      const active = await caller.sprints.create({
        projectId: PROJECT_ID,
        name: "Active sprint",
        startDate: new Date("2026-05-01"),
        endDate: new Date("2026-05-14"),
      });
      const planned = await caller.sprints.create({
        projectId: PROJECT_ID,
        name: "Next sprint",
        startDate: new Date("2026-05-15"),
        endDate: new Date("2026-05-28"),
      });

      await expect(caller.sprints.start({ id: active.id })).resolves.toMatchObject({ status: "active" });
      await expect(caller.sprints.start({ id: planned.id })).rejects.toMatchObject({
        code: "CONFLICT",
        message: "at_most_one_active",
      });
    } finally {
      await db.close();
    }
  });

  test("addTask and removeTask update task sprint assignment", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.fork().getRepository(Task) as TaskRepository;
      const caller = callerFor(repo);
      const sprint = await caller.sprints.create({
        projectId: PROJECT_ID,
        name: "Planning",
        startDate: new Date("2026-05-01"),
        endDate: new Date("2026-05-14"),
      });
      const task = await caller.tasks.create({ title: "Sprint task" });

      await expect(caller.sprints.addTask({ sprintId: sprint.id, taskId: task.id })).resolves.toEqual({ moved: true });
      let rows = await repo.getEntityManager().getConnection().execute(
        `select sprint_id from tasks where id = ?`,
        [task.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.sprint_id).toBe(sprint.id);

      await expect(caller.sprints.removeTask({ sprintId: sprint.id, taskId: task.id })).resolves.toEqual({ moved: true });
      rows = await repo.getEntityManager().getConnection().execute(`select sprint_id from tasks where id = ?`, [task.id]);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.sprint_id).toBeNull();
    } finally {
      await db.close();
    }
  });

  test("close moves unfinished tasks to backlog, writes metrics, and emits sprint.closed", async () => {
    const db = await createTestOrm();
    try {
      const repo = db.em.fork().getRepository(Task) as TaskRepository;
      const caller = callerFor(repo);
      const sprint = await caller.sprints.create({
        projectId: PROJECT_ID,
        name: "Closing",
        startDate: new Date("2026-05-01"),
        endDate: new Date("2026-05-14"),
      });
      await caller.sprints.start({ id: sprint.id });
      const done = await caller.tasks.create({ title: "Done", status: "done", points: 5 });
      const todo = await caller.tasks.create({ title: "Todo", status: "todo", points: 3 });
      await caller.sprints.addTask({ sprintId: sprint.id, taskId: done.id });
      await caller.sprints.addTask({ sprintId: sprint.id, taskId: todo.id });

      await expect(
        caller.sprints.close({ id: sprint.id, unfinishedDisposition: "backlog" }),
      ).resolves.toMatchObject({ closed: true, sprint: { id: sprint.id, status: "completed" } });

      const rows = await repo.getEntityManager().getConnection().execute(
        `select id, sprint_id from tasks where id in (?, ?) order by id`,
        [done.id, todo.id],
      );
      expect(rows).toEqual([
        { id: done.id, sprint_id: sprint.id },
        { id: todo.id, sprint_id: null },
      ].sort((a, b) => a.id.localeCompare(b.id)));

      const metrics = await repo.getEntityManager().findOneOrFail(MetricsCache, { sprint: sprint.id } as never);
      expect(metrics).toMatchObject({
        projectId: PROJECT_ID,
        completedCount: 1,
        pointsCompleted: 5,
        pointsRemaining: 3,
        wipCount: 0,
      });

      const event = await repo.getEntityManager().findOneOrFail(Event, {
        org: ORG_ID,
        verb: "sprint.closed",
        subjectKind: "sprint",
        subjectId: sprint.id,
      } as never);
      expect(event.payload).toMatchObject({
        sprint_id: sprint.id,
        project_id: PROJECT_ID,
        org_id: ORG_ID,
      });
    } finally {
      await db.close();
    }
  });
});
