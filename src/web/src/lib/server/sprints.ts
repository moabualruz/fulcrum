import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import { createSprint, appendEvent } from "../../../../product-kernel/store/repositories.ts";

export type SprintStatus = "planned" | "active" | "completed";

export const SPRINT_STATUSES: readonly SprintStatus[] = [
  "planned",
  "active",
  "completed",
] as const;

function assertSprintStatus(v: unknown): asserts v is SprintStatus {
  if (!SPRINT_STATUSES.includes(v as SprintStatus))
    throw new Error(`invalid sprint status: ${String(v)}`);
}

export interface CreateSprintInput {
  orgId: string;
  projectId: string;
  name: string;
  goal?: string | null;
  capacity?: number;
  startDate?: string | null;
  endDate?: string | null;
}

export async function createSprintAction(
  db: ProductDb,
  input: CreateSprintInput,
): Promise<{ id: string }> {
  const sprint = await createSprint(db, input);
  return { id: sprint.id };
}

export interface UpdateSprintInput {
  id: string;
  name?: string;
  goal?: string | null;
  status?: SprintStatus;
  capacity?: number;
  startDate?: string | null;
  endDate?: string | null;
}

export async function updateSprintAction(
  db: ProductDb,
  input: UpdateSprintInput,
): Promise<{ ok: true }> {
  if (!input.id) throw new Error("updateSprintAction: id is required");
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  const changed: string[] = [];
  const push = (col: string, val: string | number | null) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
    changed.push(col);
  };
  if (input.name !== undefined) push("name", input.name);
  if (input.goal !== undefined) push("goal", input.goal ?? null);
  if (input.status !== undefined) {
    assertSprintStatus(input.status);
    push("status", input.status);
  }
  if (input.capacity !== undefined) push("capacity", input.capacity);
  if (input.startDate !== undefined) push("start_date", input.startDate ?? null);
  if (input.endDate !== undefined) push("end_date", input.endDate ?? null);
  if (changed.length === 0) throw new Error("updateSprintAction: no fields to update");
  sets.push(`updated_at = now()`);
  params.push(input.id);
  const rows = await db.query<{ org_id: string; project_id: string }>(
    `UPDATE sprints SET ${sets.join(", ")} WHERE id = $${params.length}
       RETURNING org_id, project_id`,
    params,
  );
  const row = rows[0];
  if (!row) throw new Error(`updateSprintAction: sprint not found: ${input.id}`);
  await appendEvent(db, {
    orgId: row.org_id,
    projectId: row.project_id,
    actor: "system",
    subjectKind: "sprint",
    subjectId: input.id,
    verb: "updated",
    payload: { changed },
  });
  return { ok: true };
}

export async function startSprintAction(
  db: ProductDb,
  sprintId: string,
): Promise<{ ok: true }> {
  const rows = await db.query<{ org_id: string; project_id: string }>(
    `UPDATE sprints SET status = 'active', start_date = COALESCE(start_date, now()), updated_at = now()
       WHERE id = $1 AND status = 'planned' RETURNING org_id, project_id`,
    [sprintId],
  );
  const row = rows[0];
  if (!row) throw new Error(`startSprintAction: sprint not found or not planned: ${sprintId}`);
  await appendEvent(db, {
    orgId: row.org_id,
    projectId: row.project_id,
    actor: "system",
    subjectKind: "sprint",
    subjectId: sprintId,
    verb: "started",
  });
  return { ok: true };
}

export async function completeSprintAction(
  db: ProductDb,
  sprintId: string,
): Promise<{ ok: true }> {
  const rows = await db.query<{ org_id: string; project_id: string }>(
    `UPDATE sprints SET status = 'completed', end_date = COALESCE(end_date, now()), updated_at = now()
       WHERE id = $1 AND status = 'active' RETURNING org_id, project_id`,
    [sprintId],
  );
  const row = rows[0];
  if (!row) throw new Error(`completeSprintAction: sprint not found or not active: ${sprintId}`);
  await appendEvent(db, {
    orgId: row.org_id,
    projectId: row.project_id,
    actor: "system",
    subjectKind: "sprint",
    subjectId: sprintId,
    verb: "completed",
  });
  return { ok: true };
}

/** Assign a task to a sprint (or remove from sprint with null). */
export async function assignTaskToSprintAction(
  db: ProductDb,
  taskId: string,
  sprintId: string | null,
): Promise<{ ok: true }> {
  const rows = await db.query<{ org_id: string; project_id: string | null }>(
    `UPDATE tasks SET sprint_id = $1, updated_at = now()
       WHERE id = $2 RETURNING org_id, project_id`,
    [sprintId, taskId],
  );
  const row = rows[0];
  if (!row) throw new Error(`assignTaskToSprintAction: task not found: ${taskId}`);
  await appendEvent(db, {
    orgId: row.org_id,
    projectId: row.project_id,
    actor: "system",
    subjectKind: "task",
    subjectId: taskId,
    verb: "sprint_changed",
    payload: { sprint_id: sprintId },
  });
  return { ok: true };
}
