import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openPglite } from "../../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../../product-kernel/db/migrate.ts";
import {
  createLocalOrg,
  createProject,
  createTask,
} from "../../../../product-kernel/store/repositories.ts";
import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import {
  createSprintAction,
  updateSprintAction,
  startSprintAction,
  completeSprintAction,
  assignTaskToSprintAction,
} from "./sprints.ts";

let scratch: string;
let db: ProductDb;
let orgId: string;
let projectId: string;

beforeEach(async () => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-sprints-"));
  db = await openPglite(join(scratch, "main"));
  await runMigrations(db);
  const org = await createLocalOrg(db, { slug: "default", name: "Default" });
  orgId = org.id;
  const project = await createProject(db, {
    orgId,
    slug: "alpha",
    name: "Alpha",
  });
  projectId = project.id;
});

afterEach(async () => {
  await db.close();
  rmSync(scratch, { recursive: true, force: true });
});

describe("sprint CRUD", () => {
  test("createSprintAction creates a planned sprint", async () => {
    const result = await createSprintAction(db, {
      orgId,
      projectId,
      name: "Sprint 1",
      goal: "Ship MVP",
      capacity: 20,
    });
    expect(result.id).toBeTruthy();
    const rows = await db.query<{ name: string; status: string; capacity: number }>(
      `SELECT name, status, capacity FROM sprints WHERE id = $1`,
      [result.id],
    );
    expect(rows[0]?.name).toBe("Sprint 1");
    expect(rows[0]?.status).toBe("planned");
    expect(rows[0]?.capacity).toBe(20);
  });

  test("updateSprintAction updates sprint fields", async () => {
    const { id } = await createSprintAction(db, {
      orgId,
      projectId,
      name: "Sprint 1",
    });
    await updateSprintAction(db, { id, name: "Sprint 1 (renamed)", capacity: 30 });
    const rows = await db.query<{ name: string; capacity: number }>(
      `SELECT name, capacity FROM sprints WHERE id = $1`,
      [id],
    );
    expect(rows[0]?.name).toBe("Sprint 1 (renamed)");
    expect(rows[0]?.capacity).toBe(30);
  });

  test("startSprintAction transitions planned → active", async () => {
    const { id } = await createSprintAction(db, {
      orgId,
      projectId,
      name: "Sprint 1",
    });
    await startSprintAction(db, id);
    const rows = await db.query<{ status: string; start_date: string | null }>(
      `SELECT status, start_date FROM sprints WHERE id = $1`,
      [id],
    );
    expect(rows[0]?.status).toBe("active");
    expect(rows[0]?.start_date).not.toBeNull();
  });

  test("startSprintAction throws when already active", async () => {
    const { id } = await createSprintAction(db, {
      orgId,
      projectId,
      name: "Sprint 1",
    });
    await startSprintAction(db, id);
    await expect(startSprintAction(db, id)).rejects.toThrow("not planned");
  });

  test("completeSprintAction transitions active → completed", async () => {
    const { id } = await createSprintAction(db, {
      orgId,
      projectId,
      name: "Sprint 1",
    });
    await startSprintAction(db, id);
    await completeSprintAction(db, id);
    const rows = await db.query<{ status: string; end_date: string | null }>(
      `SELECT status, end_date FROM sprints WHERE id = $1`,
      [id],
    );
    expect(rows[0]?.status).toBe("completed");
    expect(rows[0]?.end_date).not.toBeNull();
  });

  test("assignTaskToSprintAction assigns task to sprint", async () => {
    const { id: sprintId } = await createSprintAction(db, {
      orgId,
      projectId,
      name: "Sprint 1",
    });
    const task = await createTask(db, {
      orgId,
      projectId,
      title: "Task A",
    });
    await assignTaskToSprintAction(db, task.id, sprintId);
    const rows = await db.query<{ sprint_id: string | null }>(
      `SELECT sprint_id FROM tasks WHERE id = $1`,
      [task.id],
    );
    expect(rows[0]?.sprint_id).toBe(sprintId);
  });

  test("assignTaskToSprintAction with null removes from sprint", async () => {
    const { id: sprintId } = await createSprintAction(db, {
      orgId,
      projectId,
      name: "Sprint 1",
    });
    const task = await createTask(db, {
      orgId,
      projectId,
      title: "Task A",
    });
    await assignTaskToSprintAction(db, task.id, sprintId);
    await assignTaskToSprintAction(db, task.id, null);
    const rows = await db.query<{ sprint_id: string | null }>(
      `SELECT sprint_id FROM tasks WHERE id = $1`,
      [task.id],
    );
    expect(rows[0]?.sprint_id).toBeNull();
  });
});
