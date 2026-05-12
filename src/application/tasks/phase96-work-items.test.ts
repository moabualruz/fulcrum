import { afterEach, describe, expect, test } from "bun:test";

import { DEFAULT_ORG_ID } from "../../db/seed.ts";
import { createTestOrm, type TestOrm } from "../../test-utils/db.ts";
import { AppConflictError, AppValidationError } from "../errors.ts";
import { createTask, setParent } from "./commands.ts";
import * as taskDetail from "./task-detail.ts";
import type { AppContext } from "./types.ts";

const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_A_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_B_ID = "33333333-3333-4333-8333-333333333333";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  await db.pglite.query(
    `insert into "projects" ("id", "org_id", "name") values ($1, $2, $3), ($4, $2, $5)`,
    [PROJECT_A_ID, DEFAULT_ORG_ID, "Project A", PROJECT_B_ID, "Project B"],
  );
  return db;
}

function projectCtx(projectId: string): AppContext {
  return { orgId: DEFAULT_ORG_ID, userId: USER_ID, projectId };
}

describe("Phase 09.6 work item model and relationship hub", () => {
  test("creates typed work item hierarchy with cycle and module grouping", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const initiative = await createTask(em, projectCtx(PROJECT_A_ID), {
      title: "Agent OS",
      taskType: "initiative",
      cycleId: "cycle-q2",
      moduleId: "module-setup",
    });
    const epic = await createTask(em, projectCtx(PROJECT_A_ID), {
      title: "Setup spine",
      taskType: "epic",
      parentId: initiative.id,
    });
    const story = await createTask(em, projectCtx(PROJECT_A_ID), {
      title: "Create project",
      taskType: "story",
      parentId: epic.id,
    });

    expect(story).toMatchObject({
      projectId: PROJECT_A_ID,
      taskType: "story",
      parentId: epic.id,
      cycleId: null,
      moduleId: null,
    });
    expect(initiative).toMatchObject({
      taskType: "initiative",
      cycleId: "cycle-q2",
      moduleId: "module-setup",
    });
  });

  test("rejects invalid hierarchy and implicit cross-project parenting", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const subtask = await createTask(em, projectCtx(PROJECT_A_ID), { title: "Subtask", taskType: "subtask" });
    const epic = await createTask(em, projectCtx(PROJECT_A_ID), { title: "Epic", taskType: "epic" });
    const projectBTask = await createTask(em, projectCtx(PROJECT_B_ID), { title: "Other", taskType: "task" });

    await expect(setParent(em, projectCtx(PROJECT_A_ID), epic.id, subtask.id)).rejects.toBeInstanceOf(AppValidationError);
    await expect(setParent(em, { orgId: DEFAULT_ORG_ID, userId: USER_ID, projectId: null }, subtask.id, projectBTask.id)).rejects.toBeInstanceOf(AppConflictError);
  });

  test("relationship hub returns typed modes, links, trace, and shared scoped views", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const epic = await createTask(em, projectCtx(PROJECT_A_ID), { title: "Epic", taskType: "epic" });
    const story = await createTask(em, projectCtx(PROJECT_A_ID), {
      title: "Story",
      taskType: "story",
      parentId: epic.id,
      status: "in_progress",
    });
    const child = await createTask(em, projectCtx(PROJECT_A_ID), {
      title: "Child",
      taskType: "subtask",
      parentId: story.id,
    });

    expect(typeof taskDetail.getTaskRelationshipHub).toBe("function");
    expect(typeof taskDetail.listScopedWorkItems).toBe("function");
    const detail = await taskDetail.getTaskRelationshipHub(em, projectCtx(PROJECT_A_ID), story.id);
    expect(detail.task.id).toBe(story.id);
    expect(detail.links.hierarchy.parent?.id).toBe(epic.id);
    expect(detail.links.hierarchy.children.map((item) => item.id)).toEqual([child.id]);
    expect(detail.modes.map((mode) => mode.id)).toEqual([
      "planning",
      "docs",
      "repo-workspace",
      "agent-run",
      "knowledge",
      "audit-activity",
    ]);
    expect(detail.trace).toMatchObject({
      projectId: PROJECT_A_ID,
      entity: { kind: "work_item", id: story.id },
    });

    const views = await taskDetail.listScopedWorkItems(em, projectCtx(PROJECT_A_ID), { view: "board" });
    expect(views.items.map((item) => item.id).sort()).toEqual([child.id, epic.id, story.id].sort());
    expect(views.trace.scope.projectId).toBe(PROJECT_A_ID);
  });

  test("task detail loads current edge schema, child rows, events, and bulk mutations", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const parent = await createTask(em, projectCtx(PROJECT_A_ID), {
      title: "Parent task",
      taskType: "task",
      status: "todo",
    });
    const child = await createTask(em, projectCtx(PROJECT_A_ID), {
      title: "Child task",
      taskType: "subtask",
      parentId: parent.id,
      status: "todo",
    });
    const linkedDocId = "44444444-4444-4444-8444-444444444444";
    await testDb.pglite.query(
      `insert into edges (org_id, from_kind, from_id, to_kind, to_id, kind)
       values ($1, 'task', $2, 'doc', $3, 'references')`,
      [DEFAULT_ORG_ID, parent.id, linkedDocId],
    );

    const detail = await taskDetail.getTaskDetail(em, parent.id, DEFAULT_ORG_ID);
    expect(detail?.task.id).toBe(parent.id);
    expect(detail?.subtasks.map((row) => row.id)).toEqual([child.id]);
    expect(detail?.edges).toMatchObject([
      {
        from_kind: "task",
        from_id: parent.id,
        to_kind: "doc",
        to_id: linkedDocId,
        rel: "references",
      },
    ]);
    expect(detail?.events.some((event) => event.verb === "created")).toBe(true);

    await expect(taskDetail.getTaskDetail(em, "55555555-5555-4555-8555-555555555555", DEFAULT_ORG_ID)).resolves.toBeNull();
    await expect(taskDetail.bulkUpdateStatus(em, [parent.id, child.id], "bogus" as never, DEFAULT_ORG_ID)).rejects.toThrow("invalid status");
    expect(await taskDetail.bulkUpdateStatus(em, [], "completed", DEFAULT_ORG_ID)).toEqual({ updated: 0 });
    expect(await taskDetail.bulkUpdateStatus(em, [parent.id, child.id], "completed", DEFAULT_ORG_ID)).toEqual({ updated: 2 });
    expect(await taskDetail.bulkDeleteTasks(em, [], DEFAULT_ORG_ID)).toEqual({ deleted: 0 });
    expect(await taskDetail.bulkDeleteTasks(em, [parent.id, child.id], DEFAULT_ORG_ID)).toEqual({ deleted: 2 });

    const events = await testDb.pglite.query<{ rows: Array<{ verb: string }> }>(
      `select verb from events where subject_id in ($1, $2) order by created_at asc`,
      [parent.id, child.id],
    );
    expect(events.rows.map((row) => row.verb)).toContain("status_changed");
    expect(events.rows.map((row) => row.verb)).toContain("deleted");
  });
});
