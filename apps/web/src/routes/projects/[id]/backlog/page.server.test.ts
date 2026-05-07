import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "@/test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "@/test-support/product-fixtures.ts";
import {
  createLocalOrg,
  createProject,
  createTask,
  createSprint,
  addTaskToSprint,
} from "@/test-support/product-fixtures.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-backlog-route-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

async function seedDb() {
  const dbDir = join(scratch, "state", "product", "db");
  mkdirSync(dbDir, { recursive: true });
  const db = await openIsolatedStore(join(dbDir, "main"));
  await migrateIsolatedStore(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  const project = await createProject(db, { orgId: org.id, slug: "proj", name: "TestProject" });
  return { db, orgId: org.id, projectId: project.id };
}

describe("backlog route loader", () => {
  test("load returns backlog tasks and sprints", async () => {
    const { db, orgId, projectId } = await seedDb();
    try {
      const sprint = await createSprint(db, { orgId, projectId, name: "Sprint 1", capacityPoints: 20 });
      const t1 = await createTask(db, { orgId, projectId, title: "Backlog task", priority: 5 });
      const t2 = await createTask(db, { orgId, projectId, title: "Sprinted task", priority: 3 });
      const t3 = await createTask(db, { orgId, projectId, title: "Done task", status: "completed" });
      await addTaskToSprint(db, { sprintId: sprint.id, taskId: t2.id });
      await db.close();

      // Dynamic import after env is set
      const mod = await import("./+page.server.ts");
      const result = await mod.load({
        params: { id: projectId },
      } as any);

      expect(result.project.name).toBe("TestProject");
      expect(result.sprints.length).toBe(1);
      expect(result.sprints[0].name).toBe("Sprint 1");
      // Backlog should only have t1 (not sprinted t2, not completed t3)
      expect(result.backlogTasks.length).toBe(1);
      expect(result.backlogTasks[0].title).toBe("Backlog task");
    } finally {
      // db already closed
    }
  });

  test("addTask action assigns task to sprint", async () => {
    const { db, orgId, projectId } = await seedDb();
    try {
      const sprint = await createSprint(db, { orgId, projectId, name: "S1" });
      const task = await createTask(db, { orgId, projectId, title: "Move me" });
      await db.close();

      const mod = await import("./+page.server.ts");
      const fd = new FormData();
      fd.set("sprintId", sprint.id);
      fd.set("taskId", task.id);
      const result = await mod.actions.addTask({
        request: new Request("http://localhost/?/addTask", { method: "POST", body: fd }),
        params: { id: projectId },
      } as any);

      expect(result).toEqual({ ok: true });
    } finally {
      // db already closed
    }
  });

  test("removeTask action unassigns task from sprint", async () => {
    const { db, orgId, projectId } = await seedDb();
    try {
      const sprint = await createSprint(db, { orgId, projectId, name: "S1" });
      const task = await createTask(db, { orgId, projectId, title: "Remove me" });
      await addTaskToSprint(db, { sprintId: sprint.id, taskId: task.id });
      await db.close();

      const mod = await import("./+page.server.ts");
      const fd = new FormData();
      fd.set("sprintId", sprint.id);
      fd.set("taskId", task.id);
      const result = await mod.actions.removeTask({
        request: new Request("http://localhost/?/removeTask", { method: "POST", body: fd }),
        params: { id: projectId },
      } as any);

      expect(result).toEqual({ ok: true });
    } finally {
      // db already closed
    }
  });
});
