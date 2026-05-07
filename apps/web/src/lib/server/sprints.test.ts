import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@/test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "@/test-support/product-fixtures.ts";
import {
  createLocalOrg,
  createProject,
  createTask,
} from "@/test-support/product-fixtures.ts";
import type { TestStore } from "@/test-support/product-fixtures.ts";
import {
  createSprintAction,
  listSprintsAction,
  addTaskToSprintAction,
  removeTaskFromSprintAction,
  listBacklogTasksAction,
  listSprintTasksAction,
  getSprintCapacity,
} from "./sprints.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-sprints-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function freshDb(name: string) {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "proj", name: "Project" });
  return { db, orgId: org.id, projectId: project.id };
}

describe("server actions: sprints", () => {
  test("createSprintAction returns id", async () => {
    const { db, orgId, projectId } = await freshDb("create");
    try {
      const { id } = await createSprintAction(db, { orgId, projectId, name: "Sprint 1" });
      expect(id).toBeTruthy();
      const sprints = await listSprintsAction(db, projectId);
      expect(sprints.length).toBe(1);
      expect(sprints[0]!.name).toBe("Sprint 1");
    } finally {
      await db.close();
    }
  });

  test("add-task + remove-task round-trip", async () => {
    const { db, orgId, projectId } = await freshDb("round-trip");
    try {
      const { id: sprintId } = await createSprintAction(db, { orgId, projectId, name: "S1" });
      const task = await createTask(db, { orgId, projectId, title: "Task" });

      await addTaskToSprintAction(db, { sprintId, taskId: task.id });
      let sprintTasks = await listSprintTasksAction(db, sprintId);
      expect(sprintTasks.length).toBe(1);

      await removeTaskFromSprintAction(db, { sprintId, taskId: task.id });
      sprintTasks = await listSprintTasksAction(db, sprintId);
      expect(sprintTasks.length).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("backlog excludes sprinted and completed tasks", async () => {
    const { db, orgId, projectId } = await freshDb("backlog");
    try {
      const { id: sprintId } = await createSprintAction(db, { orgId, projectId, name: "S1" });
      const sprinted = await createTask(db, { orgId, projectId, title: "Sprinted" });
      await createTask(db, { orgId, projectId, title: "Done", status: "completed" });
      await createTask(db, { orgId, projectId, title: "Backlog Item", priority: 10 });
      await addTaskToSprintAction(db, { sprintId, taskId: sprinted.id });

      const backlog = await listBacklogTasksAction(db, projectId);
      expect(backlog.length).toBe(1);
      expect(backlog[0]!.title).toBe("Backlog Item");
    } finally {
      await db.close();
    }
  });

  test("capacity shows over-capacity when points exceed limit", async () => {
    const { db, orgId, projectId } = await freshDb("capacity");
    try {
      const { id: sprintId } = await createSprintAction(db, {
        orgId, projectId, name: "S1", capacityPoints: 10,
      });
      const t1 = await createTask(db, { orgId, projectId, title: "T1" });
      const t2 = await createTask(db, { orgId, projectId, title: "T2" });
      await db.query(`UPDATE tasks SET estimate_points = 6 WHERE id = $1`, [t1.id]);
      await db.query(`UPDATE tasks SET estimate_points = 7 WHERE id = $1`, [t2.id]);
      await addTaskToSprintAction(db, { sprintId, taskId: t1.id });
      await addTaskToSprintAction(db, { sprintId, taskId: t2.id });

      const cap = await getSprintCapacity(db, sprintId, 10);
      expect(cap.used).toBe(13);
      expect(cap.capacity).toBe(10);
      expect(cap.percent).toBe(130);
      expect(cap.overCapacity).toBe(true);
    } finally {
      await db.close();
    }
  });

  test("capacity hidden when no capacity_points", async () => {
    const { db, orgId, projectId } = await freshDb("no-cap");
    try {
      const { id: sprintId } = await createSprintAction(db, { orgId, projectId, name: "S1" });
      const cap = await getSprintCapacity(db, sprintId, null);
      expect(cap.percent).toBeNull();
      expect(cap.overCapacity).toBe(false);
    } finally {
      await db.close();
    }
  });
});
