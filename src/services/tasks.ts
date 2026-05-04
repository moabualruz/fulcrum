/**
 * Task service — pure DB operations for task CRUD.
 * Canonical home for task actions; web layer re-exports from here.
 * Dependency direction: services -> product-kernel (never web).
 */
import type { DbHandle } from "../product-kernel/store/repositories.ts";
import { createTask } from "../product-kernel/store/repositories.ts";
import { eventDispatcher } from "../product-kernel/event-dispatcher.ts";
import type { ProductDb } from "../product-kernel/db/types.ts";

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
  const task = await createTask(db, input);
  return { id: task.id };
}

interface TaskScopeRow {
  org_id: string;
  project_id: string | null;
}

/** Resolve EntityManager from DbHandle (mirrors repositories.ts pattern). */
function assertEm(db: DbHandle) {
  if ("persist" in db && typeof (db as { persist: unknown }).persist === "function") {
    return db as import("@mikro-orm/postgresql").EntityManager;
  }
  throw new Error("tasks.ts: EntityManager required — pass em instead of raw ProductDb.");
}

function isProductDb(db: DbHandle): db is ProductDb {
  return "query" in db && typeof (db as ProductDb).query === "function";
}

export async function updateTaskAction(
  db: DbHandle,
  input: UpdateTaskInput,
): Promise<{ ok: true }> {
  if (!input.id) throw new Error("updateTaskAction: id is required");
  if (isProductDb(db)) {
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

    await eventDispatcher.dispatch(db, {
      orgId: row.org_id,
      projectId: row.project_id,
      actor: "system",
      subjectKind: "task",
      subjectId: input.id,
      verb: "updated",
      payload: { changed },
    });
    return { ok: true };
  }
  const em = assertEm(db);
  const conn = em.getConnection();

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
  const rows = await conn.execute(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = ?
       RETURNING org_id, project_id`,
    params,
  ) as Array<TaskScopeRow>;
  const row = rows[0];
  if (!row) throw new Error(`updateTaskAction: task not found: ${input.id}`);

  await eventDispatcher.dispatch(db, {
    orgId: row.org_id,
    projectId: row.project_id,
    actor: "system",
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
  if (isProductDb(db)) {
    const rows = await db.query<TaskScopeRow>(
      `DELETE FROM tasks WHERE id = $1 RETURNING org_id, project_id`,
      [id],
    );
    const row = rows[0];
    if (row) {
      await eventDispatcher.dispatch(db, {
        orgId: row.org_id,
        projectId: row.project_id,
        actor: "system",
        subjectKind: "task",
        subjectId: id,
        verb: "deleted",
      });
    }
    return { ok: true };
  }
  const em = assertEm(db);
  const conn = em.getConnection();
  const rows = await conn.execute(
    `DELETE FROM tasks WHERE id = ? RETURNING org_id, project_id`,
    [id],
  ) as Array<TaskScopeRow>;
  const row = rows[0];
  if (row) {
    await eventDispatcher.dispatch(db, {
      orgId: row.org_id,
      projectId: row.project_id,
      actor: "system",
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
  const em = assertEm(db);
  const conn = em.getConnection();
  const rows = await conn.execute(
    `UPDATE tasks SET status = ?, updated_at = now()
       WHERE id = ? AND status = ? RETURNING org_id, project_id`,
    [input.to, input.id, input.from],
  ) as Array<TaskScopeRow>;
  const row = rows[0];
  if (!row) {
    throw new Error(`status conflict: task ${input.id} not in ${input.from}`);
  }
  await eventDispatcher.dispatch(db, {
    orgId: row.org_id,
    projectId: row.project_id,
    actor: "system",
    subjectKind: "task",
    subjectId: input.id,
    verb: "status_changed",
    payload: { from: input.from, to: input.to, task: input.id },
  });
  return { ok: true };
}
