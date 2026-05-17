import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { AppConflictError, AppForbiddenError, AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import {
  bulkDelete,
  bulkUpdate,
  createTask,
  deleteTask,
  normalizedUnique,
  setDependencies,
  setParent,
  updateTask,
} from "@work-management/application/tasks/commands.ts";
import {
  findVisibleTask,
  getTask,
  listBoardTaskRows,
  listChildren,
  listOpenTaskOptions,
  listTasks,
} from "@work-management/application/tasks/queries.ts";
import type { AppContext } from "@work-management/application/tasks/types.ts";

const PROJECT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PROJECT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_ORG_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ASSIGNEE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const BULK_ASSIGNEE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  await db.em.getConnection().execute(
    `INSERT INTO projects (id, org_id, slug, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, now(), now()), (?, ?, ?, ?, ?, now(), now())`,
    [
      PROJECT_ID,
      DEFAULT_ORG_ID,
      "tasks-project",
      "Tasks Project",
      "Task app workflow coverage",
      OTHER_PROJECT_ID,
      DEFAULT_ORG_ID,
      "other-tasks-project",
      "Other Tasks Project",
      "Scope checks",
    ],
  );
  return db;
}

function ctx(projectId: string | null = PROJECT_ID, orgId = DEFAULT_ORG_ID): AppContext {
  return { orgId, userId: "user-tasks", projectId };
}

describe("application task commands and queries", () => {
  test("runs a full real task lifecycle with hierarchy, dependencies, bulk operations, and read models", async () => {
    const testDb = await freshDb();
    const em = testDb.em;

    const initiative = await createTask(em, ctx(), {
      title: "Initiative",
      taskType: "initiative",
      status: "pending",
      descriptionText: "Top level work",
      cycleId: "cycle-1",
      moduleId: "module-1",
    });
    const epic = await createTask(em, ctx(), {
      title: "Epic",
      taskType: "epic",
      parentId: initiative.id,
      points: 8,
      priority: 4,
    });
    const story = await createTask(em, ctx(), {
      title: "Story",
      taskType: "story",
      parentId: epic.id,
      status: "in_progress",
      assigneeId: ASSIGNEE_ID,
    });
    const blocker = await createTask(em, ctx(), {
      title: "Blocker",
      taskType: "bug",
      status: "blocked",
    });

    expect(await getTask(em, ctx(), initiative.id)).toMatchObject({
      id: initiative.id,
      descriptionText: "Top level work",
      cycleId: "cycle-1",
      moduleId: "module-1",
    });
    expect((await listTasks(em, ctx())).map((task) => task.id).sort()).toEqual(
      [initiative.id, epic.id, story.id, blocker.id].sort(),
    );
    expect(await listChildren(em, ctx(), initiative.id)).toEqual([
      expect.objectContaining({ id: epic.id, parentId: initiative.id }),
    ]);
    expect(await listOpenTaskOptions(em, ctx())).toEqual(expect.arrayContaining([
      { id: initiative.id, project_id: PROJECT_ID, title: "Initiative" },
      { id: story.id, project_id: PROJECT_ID, title: "Story" },
      { id: blocker.id, project_id: PROJECT_ID, title: "Blocker" },
    ]));
    expect(await listBoardTaskRows(em, ctx())).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: story.id, status: "in_progress", project_id: PROJECT_ID }),
    ]));

    const updated = await updateTask(em, ctx(), story.id, {
      expectedStatus: "in_progress",
      status: "done",
      title: "Story complete",
      priority: 9,
      points: 5,
      assigneeId: null,
      cycleId: null,
      moduleId: "module-2",
    });
    expect(updated).toMatchObject({
      id: story.id,
      title: "Story complete",
      status: "done",
      priority: 9,
      points: 5,
      assigneeId: null,
      cycleId: null,
      moduleId: "module-2",
    });
    expect(await em.count(Event, { subjectId: story.id, verb: "status_changed" } as never)).toBe(1);

    const moved = await setParent(em, ctx(), blocker.id, story.id);
    expect(moved.parentId).toBe(story.id);
    await expect(setParent(em, ctx(), initiative.id, blocker.id)).rejects.toBeInstanceOf(AppConflictError);
    await expect(createTask(em, ctx(), {
      title: "Invalid child",
      taskType: "initiative",
      parentId: story.id,
    })).rejects.toBeInstanceOf(AppValidationError);

    const dependencies = await setDependencies(em, ctx(), story.id, {
      blocks: [blocker.id],
      blocked_by: [epic.id],
    });
    expect(dependencies.dependencies).toEqual({
      blocks: [blocker.id],
      blocked_by: [epic.id],
    });
    expect((await getTask(em, ctx(), epic.id)).dependencies.blocks).toContain(story.id);
    await expect(setDependencies(em, ctx(), story.id, {
      blocks: [story.id],
      blocked_by: [],
    })).rejects.toBeInstanceOf(AppConflictError);
    await expect(setDependencies(em, ctx(), story.id, {
      blocks: [randomUUID()],
      blocked_by: [],
    })).rejects.toBeInstanceOf(AppNotFoundError);

    await bulkUpdate(em, ctx(), [epic.id, blocker.id], {
      status: "blocked",
      label: "risk",
      assignee: BULK_ASSIGNEE_ID,
    });
    expect((await getTask(em, ctx(), epic.id)).status).toBe("blocked");
    expect(await em.count(Event, { verb: "bulk_updated" } as never)).toBe(2);

    await bulkDelete(em, ctx(), [epic.id, blocker.id]);
    expect(await em.count(Event, { verb: "bulk_deleted" } as never)).toBe(2);
    expect((await listTasks(em, ctx())).map((task) => task.id).sort()).toEqual([initiative.id, story.id].sort());
    expect((await listTasks(em, ctx(), { includeDeleted: true })).map((task) => task.id)).toEqual(
      expect.arrayContaining([epic.id, blocker.id]),
    );

    const deleted = await deleteTask(em, ctx(), story.id);
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    await expect(getTask(em, ctx(), story.id)).rejects.toBeInstanceOf(AppNotFoundError);
  });

  test("enforces validation, project scope, org scope, and bulk limits against real rows", async () => {
    const testDb = await freshDb();
    const em = testDb.em;

    await expect(createTask(em, ctx(), { title: "" })).rejects.toBeInstanceOf(AppValidationError);
    const projectTask = await createTask(em, ctx(), { title: "Project scoped task" });
    const otherProjectTask = await createTask(em, ctx(OTHER_PROJECT_ID), { title: "Other project task" });
    const globalTask = await createTask(em, ctx(null), { title: "Global task", projectId: null });

    await expect(getTask(em, ctx(OTHER_PROJECT_ID), projectTask.id)).rejects.toBeInstanceOf(AppNotFoundError);
    await expect(setParent(em, ctx(), projectTask.id, otherProjectTask.id)).rejects.toBeInstanceOf(AppNotFoundError);
    await expect(updateTask(em, ctx(), projectTask.id, {
      expectedStatus: "done",
      status: "pending",
    })).rejects.toBeInstanceOf(AppConflictError);
    await expect(bulkUpdate(em, ctx(), Array.from({ length: 201 }, () => randomUUID()), { status: "done" }))
      .rejects.toBeInstanceOf(AppValidationError);
    await expect(bulkDelete(em, ctx(), [projectTask.id, otherProjectTask.id])).rejects.toBeInstanceOf(AppNotFoundError);

    em.persist(em.create(Org, {
      id: OTHER_ORG_ID,
      name: "Other Org",
      slug: "other-org",
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    await (em as any).flush();
    const otherOrgTask = await createTask(em, ctx(null, OTHER_ORG_ID), { title: "Other org", projectId: null });

    await expect(findVisibleTask(em, ctx(null), otherOrgTask.id)).rejects.toBeInstanceOf(AppForbiddenError);
    expect((await listTasks(em, ctx(null))).map((task) => task.id)).toEqual(expect.arrayContaining([
      projectTask.id,
      otherProjectTask.id,
      globalTask.id,
    ]));
    expect(normalizedUnique(["b", "a", "b"])).toEqual(["a", "b"]);
  });
});
