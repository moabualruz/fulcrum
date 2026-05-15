/**
 * Task service — pure DB operations for task CRUD.
 * Canonical home for task actions; web layer re-exports from here.
 * Dependency direction: services use neutral persistence protocols (never web).
 */
import type { EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";
import type { SqlExecutor } from "@platform-core/infrastructure/application-database/sql.ts";
import { newUlid } from "@platform-core/application/platform-primitives/monotonic-id.ts";

type DbHandle = EntityManager | { em?: EntityManager } | SqlExecutor;

export type TaskStatus =
  | "pending"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled";

export const TASK_STATUSES: readonly TaskStatus[] = [
  "pending", "in_progress", "blocked", "completed", "cancelled",
] as const;

function assertStatus(v: unknown, label: string): asserts v is TaskStatus {
  if (!TASK_STATUSES.includes(v as TaskStatus)) throw new Error(`${label}: invalid status ${String(v)}`);
}

export interface CreateTaskInput {
  orgId: string;
  projectId: string | null;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: number;
}

export interface UpdateTaskInput {
  id: string;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: number;
  startDate?: string | null;
  dueDate?: string | null;
}

export async function createTaskAction(
  db: DbHandle,
  input: CreateTaskInput,
): Promise<{ id: string }> {
  if (input.status !== undefined) assertStatus(input.status, "createTaskAction");
  const status = input.status ?? "pending";
  if (isSqlExecutor(db)) {
    const id = newUlid();
    await db.query(
      `INSERT INTO tasks (id, org_id, project_id, title, description, status, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, input.orgId, input.projectId, input.title, input.description ?? null, status, input.priority ?? 0],
    );
    await appendServiceEvent(db, {
      orgId: input.orgId,
      projectId: input.projectId,
      subjectKind: "task",
      subjectId: id,
      verb: "created",
      payload: { title: input.title, status },
    });
    return { id };
  }
  const em = assertEm(db);
    const id = randomUUID();
  await em.query(
    `INSERT INTO tasks (id, org_id, project_id, title, description, status, priority)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.orgId, input.projectId, input.title, input.description ?? null, status, input.priority ?? 0],
  );
  await appendServiceEvent(db, {
    orgId: input.orgId,
    projectId: input.projectId,
    subjectKind: "task",
    subjectId: id,
    verb: "created",
    payload: { title: input.title, status },
  });
  return { id };
}

interface TaskScopeRow {
  org_id: string;
  project_id: string | null;
}

function assertEm(db: DbHandle) {
  if ("persist" in db && typeof (db as { persist: unknown }).persist === "function") {
    return db as EntityManager;
  }
  if ("em" in db) {
    const em = (db as { em?: unknown }).em;
    if (em && typeof (em as { persist?: unknown }).persist === "function") {
      return em as EntityManager;
    }
  }
  throw new Error("tasks.ts: EntityManager required for this operation.");
}

function isSqlExecutor(db: DbHandle): db is SqlExecutor {
  // EntityManager also has .query() — distinguish by checking for TypeORM-specific methods
  if ("getRepository" in db || "findOne" in db || "save" in db || "transaction" in db) return false;
  return !("em" in db) && "query" in db && typeof (db as { query: unknown }).query === "function";
}

async function appendServiceEvent(
  db: DbHandle,
  input: {
    orgId: string;
    projectId?: string | null;
    subjectKind: string;
    subjectId: string;
    verb: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  if (isSqlExecutor(db)) {
    const id = newUlid();
    await db.query(
      `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at)
       VALUES ($1, $2, $3, 'system', $4, $5, $6, $7::jsonb, now())`,
      [id, input.orgId, input.projectId ?? null, input.subjectKind, input.subjectId, input.verb, JSON.stringify(input.payload ?? {})],
    );
    return;
  }
  const em = assertEm(db);
  const id = randomUUID();
  await em.query(
    `INSERT INTO events (id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at)
     VALUES (?, ?, ?, 'system', ?, ?, ?, ?::jsonb, now())`,
    [id, input.orgId, input.projectId ?? null, input.subjectKind, input.subjectId, input.verb, JSON.stringify(input.payload ?? {})],
  );
}

export async function updateTaskAction(
  db: DbHandle,
  input: UpdateTaskInput,
): Promise<{ ok: true }> {
  if (!input.id) throw new Error("updateTaskAction: id is required");
  if (isSqlExecutor(db)) {
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    const changed: string[] = [];
    const push = (col: string, val: string | number | null) => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
      changed.push(col);
    };
    if (input.title !== undefined) push("title", input.title);
    if (input.description !== undefined) push("description", input.description);
    if (input.status !== undefined) {
      assertStatus(input.status, "updateTaskAction");
      push("status", input.status);
    }
    if (input.priority !== undefined) push("priority", input.priority);
    if (input.startDate !== undefined) push("start_date", input.startDate);
    if (input.dueDate !== undefined) push("due_date", input.dueDate);
    if (changed.length === 0) throw new Error("updateTaskAction: no fields to update");

    sets.push("updated_at = now()");
    params.push(input.id);
    const rows = await db.query<TaskScopeRow>(
      `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${params.length}
       RETURNING org_id, project_id`,
      params,
    );
    const row = rows[0];
    if (!row) throw new Error(`updateTaskAction: task not found: ${input.id}`);

    await appendServiceEvent(db, {
      orgId: row.org_id,
      projectId: row.project_id,
      subjectKind: "task",
      subjectId: input.id,
      verb: "updated",
      payload: { changed },
    });
    return { ok: true };
  }
  const em = assertEm(db);
    const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const changed: string[] = [];
  const push = (col: string, val: string | number | null) => {
    params.push(val);
    sets.push(`${col} = ?`);
    changed.push(col);
  };
  if (input.title !== undefined) push("title", input.title);
  if (input.description !== undefined) push("description", input.description);
  if (input.status !== undefined) {
    assertStatus(input.status, "updateTaskAction");
    push("status", input.status);
  }
  if (input.priority !== undefined) push("priority", input.priority);
  if (input.startDate !== undefined) push("start_date", input.startDate);
  if (input.dueDate !== undefined) push("due_date", input.dueDate);
  if (changed.length === 0) throw new Error("updateTaskAction: no fields to update");

  sets.push(`updated_at = now()`);
  params.push(input.id);
  const rows = await em.query(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = ?
       RETURNING org_id, project_id`,
    params,
  ) as Array<TaskScopeRow>;
  const row = rows[0];
  if (!row) throw new Error(`updateTaskAction: task not found: ${input.id}`);

  await appendServiceEvent(db, {
    orgId: row.org_id,
    projectId: row.project_id,
    subjectKind: "task",
    subjectId: input.id,
    verb: "updated",
    payload: { changed },
  });
  return { ok: true };
}

export async function deleteTaskAction(
  db: DbHandle,
  id: string,
): Promise<{ ok: true }> {
  if (isSqlExecutor(db)) {
    const rows = await db.query<TaskScopeRow>(
      `DELETE FROM tasks WHERE id = $1 RETURNING org_id, project_id`,
      [id],
    );
    const row = rows[0];
    if (row) {
      await appendServiceEvent(db, {
        orgId: row.org_id,
        projectId: row.project_id,
        subjectKind: "task",
        subjectId: id,
        verb: "deleted",
      });
    }
    return { ok: true };
  }
  const em = assertEm(db);
    const rows = await em.query(
    `DELETE FROM tasks WHERE id = ? RETURNING org_id, project_id`,
    [id],
  ) as Array<TaskScopeRow>;
  const row = rows[0];
  if (row) {
    await appendServiceEvent(db, {
      orgId: row.org_id,
      projectId: row.project_id,
      subjectKind: "task",
      subjectId: id,
      verb: "deleted",
    });
  }
  return { ok: true };
}

export async function moveTaskStatusAction(
  db: DbHandle,
  input: { id: string; from: TaskStatus; to: TaskStatus },
): Promise<{ ok: true }> {
  assertStatus(input.from, "moveTaskStatusAction.from");
  assertStatus(input.to, "moveTaskStatusAction.to");
  if (isSqlExecutor(db)) {
    const rows = await db.query<TaskScopeRow>(
      `UPDATE tasks SET status = $1, updated_at = now()
       WHERE id = $2 AND status = $3 RETURNING org_id, project_id`,
      [input.to, input.id, input.from],
    );
    const row = rows[0];
    if (!row) {
      throw new Error(`status conflict: task ${input.id} not in ${input.from}`);
    }
    await appendServiceEvent(db, {
      orgId: row.org_id,
      projectId: row.project_id,
      subjectKind: "task",
      subjectId: input.id,
      verb: "status_changed",
      payload: { from: input.from, to: input.to, task: input.id },
    });
    return { ok: true };
  }
  const em = assertEm(db);
    const rows = await em.query(
    `UPDATE tasks SET status = ?, updated_at = now()
       WHERE id = ? AND status = ? RETURNING org_id, project_id`,
    [input.to, input.id, input.from],
  ) as Array<TaskScopeRow>;
  const row = rows[0];
  if (!row) {
    throw new Error(`status conflict: task ${input.id} not in ${input.from}`);
  }
  await appendServiceEvent(db, {
    orgId: row.org_id,
    projectId: row.project_id,
    subjectKind: "task",
    subjectId: input.id,
    verb: "status_changed",
    payload: { from: input.from, to: input.to, task: input.id },
  });
  return { ok: true };
}
