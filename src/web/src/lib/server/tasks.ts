import type { ProductDb } from "@fulcrum/product-kernel/db/types.ts";
import { createTask, appendEvent } from "@fulcrum/product-kernel/store/repositories.ts";

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
  db: ProductDb,
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

export async function updateTaskAction(
  db: ProductDb,
  input: UpdateTaskInput,
): Promise<{ ok: true }> {
  if (!input.id) throw new Error("updateTaskAction: id is required");
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
  if (changed.includes("due_date") || changed.includes("start_date")) {
    await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date date`);
    await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date date`);
  }
  sets.push(`updated_at = now()`);
  params.push(input.id);
  const rows = await db.query<TaskScopeRow>(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${params.length}
       RETURNING org_id, project_id`,
    params,
  );
  const row = rows[0];
  if (!row) throw new Error(`updateTaskAction: task not found: ${input.id}`);
  await appendEvent(db, {
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
  db: ProductDb,
  id: string,
): Promise<{ ok: true }> {
  const rows = await db.query<TaskScopeRow>(
    `DELETE FROM tasks WHERE id = $1 RETURNING org_id, project_id`,
    [id],
  );
  const row = rows[0];
  if (row) {
    await appendEvent(db, {
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
  db: ProductDb,
  input: { id: string; from: TaskStatus; to: TaskStatus },
): Promise<{ ok: true }> {
  assertStatus(input.from, "moveTaskStatusAction.from");
  assertStatus(input.to, "moveTaskStatusAction.to");
  const rows = await db.query<TaskScopeRow>(
    `UPDATE tasks SET status = $1, updated_at = now()
       WHERE id = $2 AND status = $3 RETURNING org_id, project_id`,
    [input.to, input.id, input.from],
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`status conflict: task ${input.id} not in ${input.from}`);
  }
  await appendEvent(db, {
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
