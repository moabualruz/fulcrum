import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { DEFAULT_ORG_ID } from "@platform-core/infrastructure/application-database/seed.ts";
import type { SqlExecutor, SqlValue } from "@platform-core/infrastructure/application-database/sql.ts";
import { createTestOrm, type TestOrm } from "@test-support/application-database.ts";
import {
  createTaskAction,
  deleteTaskAction,
  moveTaskStatusAction,
  updateTaskAction,
} from "@work-management/application/work-item-service-actions.ts";

let db: TestOrm | null = null;

afterEach(async () => {
  await db?.close();
  db = null;
});

async function freshDb(): Promise<TestOrm> {
  db = await createTestOrm();
  return db;
}

async function createProject(em: TestOrm["em"]): Promise<string> {
  const id = randomUUID();
  await em.getConnection().execute(
    `INSERT INTO projects (id, org_id, slug, name, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, now(), now())`,
    [id, DEFAULT_ORG_ID, `task-service-${id.slice(0, 8)}`, "Task Service Project", "Integration coverage"],
  );
  return id;
}

async function taskEvents(em: TestOrm["em"], taskId: string): Promise<Array<{ verb: string; payload: Record<string, unknown> }>> {
  return await em.getConnection().execute(
    `SELECT verb, payload FROM events WHERE subject_kind = 'task' AND subject_id = ? ORDER BY created_at ASC, id ASC`,
    [taskId],
  ) as Array<{ verb: string; payload: Record<string, unknown> }>;
}

describe("task service actions with real MikroORM persistence", () => {
  test("creates, updates, moves status, deletes, and records task events", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const projectId = await createProject(em);

    const created = await createTaskAction(em, {
      orgId: DEFAULT_ORG_ID,
      projectId,
      title: "Service task",
      description: "Created by real service test",
      status: "pending",
      priority: 2,
    });

    let rows = await em.getConnection().execute(
      `SELECT id, title, description, status, priority, project_id FROM tasks WHERE id = ?`,
      [created.id],
    ) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      id: created.id,
      title: "Service task",
      description: "Created by real service test",
      status: "pending",
      priority: 2,
      project_id: projectId,
    });

    await updateTaskAction(em, {
      id: created.id,
      title: "Service task updated",
      description: null,
      status: "in_progress",
      priority: 5,
      startDate: "2026-05-11",
      dueDate: "2026-05-12",
    });
    await moveTaskStatusAction(em, { id: created.id, from: "in_progress", to: "blocked" });

    rows = await em.getConnection().execute(
      `SELECT title, description, status, priority, start_date::text AS start_date, due_date::text AS due_date FROM tasks WHERE id = ?`,
      [created.id],
    ) as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({
      title: "Service task updated",
      description: null,
      status: "blocked",
      priority: 5,
      start_date: "2026-05-11",
      due_date: "2026-05-12",
    });

    await deleteTaskAction(em, created.id);
    rows = await em.getConnection().execute(`SELECT id FROM tasks WHERE id = ?`, [created.id]) as Array<Record<string, unknown>>;
    expect(rows).toEqual([]);

    const events = await taskEvents(em, created.id);
    expect(events.map((event) => event.verb).sort()).toEqual(["created", "deleted", "status_changed", "updated"]);
    expect(events.find((event) => event.verb === "created")!.payload).toMatchObject({ title: "Service task", status: "pending" });
    expect(events.find((event) => event.verb === "updated")!.payload.changed).toEqual([
      "title",
      "description",
      "status",
      "priority",
      "start_date",
      "due_date",
    ]);
    expect(events.find((event) => event.verb === "status_changed")!.payload).toMatchObject({
      from: "in_progress",
      to: "blocked",
      task: created.id,
    });
  });

  test("rejects invalid status and stale status transitions without changing persisted rows", async () => {
    const testDb = await freshDb();
    const em = testDb.em.fork();
    const projectId = await createProject(em);
    const created = await createTaskAction(em, {
      orgId: DEFAULT_ORG_ID,
      projectId,
      title: "Conflict task",
      status: "pending",
    });

    await expect(updateTaskAction(em, { id: created.id, status: "invalid" as never })).rejects.toThrow("invalid status");
    await expect(moveTaskStatusAction(em, { id: created.id, from: "completed", to: "cancelled" })).rejects.toThrow("status conflict");

    const rows = await em.getConnection().execute(
      `SELECT status FROM tasks WHERE id = ?`,
      [created.id],
    ) as Array<{ status: string }>;
    expect(rows[0]!.status).toBe("pending");
  });

  test("SqlExecutor branch creates, updates, moves, deletes, validates status, and emits task events", async () => {
    const queries: Array<{ sql: string; params: readonly SqlValue[] }> = [];
    const tasks = new Map<string, Record<string, unknown>>();
    const events: Array<Record<string, unknown>> = [];
    const projectId = "project-sql-tasks";
    const sqlDb: SqlExecutor = {
      engine: "pglite",
      async query<T>(sql: string, params: readonly SqlValue[] = []) {
        queries.push({ sql, params });
        if (sql.includes("INSERT INTO tasks")) {
          tasks.set(String(params[0]), {
            id: params[0],
            org_id: params[1],
            project_id: params[2],
            title: params[3],
            description: params[4],
            status: params[5],
            priority: params[6],
          });
          return [] as T[];
        }
        if (sql.includes("INSERT INTO events")) {
          events.push({
            id: params[0],
            org_id: params[1],
            project_id: params[2],
            subject_kind: params[3],
            subject_id: params[4],
            verb: params[5],
            payload: JSON.parse(String(params[6])),
          });
          return [] as T[];
        }
        if (sql.includes("UPDATE tasks SET status = $1") && sql.includes("WHERE id = $2 AND status = $3")) {
          const task = tasks.get(String(params[1]));
          if (!task || task["status"] !== params[2]) return [] as T[];
          task["status"] = params[0];
          return [{ org_id: task["org_id"], project_id: task["project_id"] }] as T[];
        }
        if (sql.includes("UPDATE tasks SET") && sql.includes("RETURNING org_id, project_id")) {
          const id = String(params.at(-1));
          const task = tasks.get(id);
          if (!task) return [] as T[];
          const setColumns = [...sql.matchAll(/([a-z_]+) = \$\d+/g)].map((match) => match[1]!);
          for (const [index, column] of setColumns.entries()) {
            if (column !== "updated_at") task[column] = params[index];
          }
          return [{ org_id: task["org_id"], project_id: task["project_id"] }] as T[];
        }
        if (sql.includes("DELETE FROM tasks")) {
          const task = tasks.get(String(params[0]));
          if (!task) return [] as T[];
          tasks.delete(String(params[0]));
          return [{ org_id: task["org_id"], project_id: task["project_id"] }] as T[];
        }
        throw new Error(`unexpected SQL: ${sql}`);
      },
      async exec() {},
      async close() {},
    };

    await expect(createTaskAction(sqlDb, {
      orgId: DEFAULT_ORG_ID,
      projectId,
      title: "Bad task",
      status: "bad" as never,
    })).rejects.toThrow("createTaskAction: invalid status bad");

    const created = await createTaskAction(sqlDb, {
      orgId: DEFAULT_ORG_ID,
      projectId,
      title: "SQL task",
      description: "executor branch",
      status: "pending",
      priority: 1,
    });
    expect(tasks.get(created.id)).toMatchObject({
      org_id: DEFAULT_ORG_ID,
      project_id: projectId,
      title: "SQL task",
      description: "executor branch",
      status: "pending",
      priority: 1,
    });

    await updateTaskAction(sqlDb, {
      id: created.id,
      title: "SQL task updated",
      description: null,
      status: "in_progress",
      priority: 4,
      startDate: "2026-05-11",
      dueDate: "2026-05-12",
    });
    expect(tasks.get(created.id)).toMatchObject({
      title: "SQL task updated",
      description: null,
      status: "in_progress",
      priority: 4,
      start_date: "2026-05-11",
      due_date: "2026-05-12",
    });

    await expect(updateTaskAction(sqlDb, { id: "" })).rejects.toThrow("id is required");
    await expect(updateTaskAction(sqlDb, { id: created.id })).rejects.toThrow("no fields to update");
    await expect(updateTaskAction(sqlDb, { id: "missing-task", title: "Missing" })).rejects.toThrow("task not found");
    await expect(moveTaskStatusAction(sqlDb, { id: created.id, from: "completed", to: "cancelled" }))
      .rejects.toThrow("status conflict");

    await moveTaskStatusAction(sqlDb, { id: created.id, from: "in_progress", to: "blocked" });
    expect(tasks.get(created.id)?.["status"]).toBe("blocked");

    await expect(deleteTaskAction(sqlDb, "missing-task")).resolves.toEqual({ ok: true });
    await deleteTaskAction(sqlDb, created.id);
    expect(tasks.has(created.id)).toBe(false);
    expect(events.map((event) => event["verb"])).toEqual(["created", "updated", "status_changed", "deleted"]);
    expect(events.find((event) => event["verb"] === "updated")?.["payload"]).toEqual({
      changed: ["title", "description", "status", "priority", "start_date", "due_date"],
    });
    expect(events.find((event) => event["verb"] === "status_changed")?.["payload"]).toEqual({
      from: "in_progress",
      to: "blocked",
      task: created.id,
    });
    expect(queries.filter(({ sql }) => sql.includes("INSERT INTO events"))).toHaveLength(4);
  });
});
