import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../../test-support/product-fixtures.ts";
import type { TestStore } from "../../test-support/product-fixtures.ts";
import {
  createLocalOrg,
  createProject,
  createTask,
  createSprint,
  listSprints,
  addTaskToSprint,
  removeTaskFromSprint,
  listBacklogTasks,
  listSprintTasks,
  sprintCapacityUsed,
  type SprintRow,
  type TaskRow,
  type EventRow,
} from "./repositories.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-sprints-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function freshDb(name: string) {
  const db = await openIsolatedStore(join(scratch, name));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "proj", name: "Project" });
  return { db, orgId: org.id, projectId: project.id };
}

describe("sprint CRUD", () => {
  test("createSprint inserts row + emits event", async () => {
    const { db, orgId, projectId } = await freshDb("create");
    try {
      const sprint = await createSprint(db, {
        orgId,
        projectId,
        name: "Sprint 1",
        goal: "Ship backlog view",
        capacityPoints: 21,
      });
      expect(sprint.name).toBe("Sprint 1");
      expect(sprint.goal).toBe("Ship backlog view");
      expect(sprint.status).toBe("planning");
      expect(sprint.capacity_points).toBe(21);

      const events = await db.query<EventRow>(
        `SELECT * FROM events WHERE subject_id = $1`,
        [sprint.id],
      );
      expect(events.length).toBe(1);
      expect(events[0]!.verb).toBe("created");
    } finally {
      await db.close();
    }
  });

  test("listSprints returns sprints for project", async () => {
    const { db, orgId, projectId } = await freshDb("list");
    try {
      await createSprint(db, { orgId, projectId, name: "S1" });
      await createSprint(db, { orgId, projectId, name: "S2" });
      const sprints = await listSprints(db, projectId);
      expect(sprints.length).toBe(2);
    } finally {
      await db.close();
    }
  });
});

describe("sprint task assignment", () => {
  test("addTaskToSprint + removeTaskFromSprint round-trip", async () => {
    const { db, orgId, projectId } = await freshDb("add-remove");
    try {
      const sprint = await createSprint(db, { orgId, projectId, name: "S1" });
      const task = await createTask(db, { orgId, projectId, title: "Task A", priority: 5 });

      await addTaskToSprint(db, { sprintId: sprint.id, taskId: task.id });
      let sprintTasks = await listSprintTasks(db, sprint.id);
      expect(sprintTasks.length).toBe(1);
      expect(sprintTasks[0]!.id).toBe(task.id);

      // Should be out of backlog now
      let backlog = await listBacklogTasks(db, projectId);
      expect(backlog.find((t) => t.id === task.id)).toBeUndefined();

      await removeTaskFromSprint(db, { sprintId: sprint.id, taskId: task.id });
      sprintTasks = await listSprintTasks(db, sprint.id);
      expect(sprintTasks.length).toBe(0);

      backlog = await listBacklogTasks(db, projectId);
      expect(backlog.find((t) => t.id === task.id)).toBeDefined();
    } finally {
      await db.close();
    }
  });

  test("backlog excludes completed tasks", async () => {
    const { db, orgId, projectId } = await freshDb("backlog-filter");
    try {
      await createTask(db, { orgId, projectId, title: "Done", status: "completed" });
      await createTask(db, { orgId, projectId, title: "Open", status: "pending" });
      const backlog = await listBacklogTasks(db, projectId);
      expect(backlog.length).toBe(1);
      expect(backlog[0]!.title).toBe("Open");
    } finally {
      await db.close();
    }
  });

  test("sprintCapacityUsed sums estimate_points", async () => {
    const { db, orgId, projectId } = await freshDb("capacity");
    try {
      const sprint = await createSprint(db, { orgId, projectId, name: "S1", capacityPoints: 10 });
      const t1 = await createTask(db, { orgId, projectId, title: "T1" });
      const t2 = await createTask(db, { orgId, projectId, title: "T2" });
      // Set estimate_points directly
      await db.query(`UPDATE tasks SET estimate_points = 3 WHERE id = $1`, [t1.id]);
      await db.query(`UPDATE tasks SET estimate_points = 5 WHERE id = $1`, [t2.id]);
      await addTaskToSprint(db, { sprintId: sprint.id, taskId: t1.id });
      await addTaskToSprint(db, { sprintId: sprint.id, taskId: t2.id });

      const used = await sprintCapacityUsed(db, sprint.id);
      expect(used).toBe(8);
    } finally {
      await db.close();
    }
  });

  test("addTaskToSprint throws for missing sprint", async () => {
    const { db, orgId, projectId } = await freshDb("missing-sprint");
    try {
      const task = await createTask(db, { orgId, projectId, title: "T" });
      expect(addTaskToSprint(db, { sprintId: "nonexistent", taskId: task.id })).rejects.toThrow(
        "sprint not found",
      );
    } finally {
      await db.close();
    }
  });
});
