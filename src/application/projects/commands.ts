import type { EntityManager } from "@mikro-orm/postgresql";

import { randomUUID } from "node:crypto";
import { ormSqlConnection } from "../orm-helpers.ts";
import type { AppContext } from "../tasks/types.ts";

export async function updateProject(
  em: EntityManager,
  ctx: AppContext,
  input: { id: string; name?: string; description?: string | null },
): Promise<{ ok: true }> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.name !== undefined) {
    params.push(input.name);
    sets.push(`name = $${params.length}`);
  }
  if (input.description !== undefined) {
    params.push(input.description);
    sets.push(`description = $${params.length}`);
  }
  if (sets.length === 0) return { ok: true };
  params.push(input.id, ctx.orgId);
  await ormSqlConnection(em).execute(
    `UPDATE projects SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $${params.length - 1} AND org_id = $${params.length}`,
    params,
  );
  return { ok: true };
}

export async function deleteProject(em: EntityManager, ctx: AppContext, id: string): Promise<{ ok: true }> {
  const conn = ormSqlConnection(em);
  await conn.execute(`DELETE FROM events WHERE project_id = $1 AND org_id = $2`, [id, ctx.orgId]);
  await conn.execute(`DELETE FROM projects WHERE id = $1 AND org_id = $2`, [id, ctx.orgId]);
  return { ok: true };
}

export async function rescheduleProjectTask(
  em: EntityManager,
  ctx: AppContext,
  input: { taskId: string; startDate?: string | null; dueDate?: string | null },
): Promise<{ ok: true }> {
  if (!input.taskId) throw new Error("task id required");
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.startDate !== undefined) {
    params.push(input.startDate);
    sets.push(`start_date = $${params.length}`);
  }
  if (input.dueDate !== undefined) {
    params.push(input.dueDate);
    sets.push(`due_date = $${params.length}`);
  }
  if (sets.length === 0) return { ok: true };
  params.push(input.taskId, ctx.orgId, ctx.projectId ?? null);
  const rows = await ormSqlConnection(em).execute<Array<{ id: string }>>(
    `UPDATE tasks
        SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $${params.length - 2}
        AND org_id = $${params.length - 1}
        AND project_id = $${params.length}
        AND deleted_at IS NULL
      RETURNING id`,
    params,
  );
  if (!rows[0]) throw new Error("task not found");
  return { ok: true };
}

export async function createProjectTask(
  em: EntityManager,
  ctx: AppContext,
  input: { title: string; status?: string | null; sprintId?: string | null },
): Promise<{ id: string }> {
  const id = randomUUID();
  await ormSqlConnection(em).execute(
    `INSERT INTO tasks (id, org_id, project_id, title, status, sprint_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
    [id, ctx.orgId, ctx.projectId ?? null, input.title, input.status ?? "pending", input.sprintId ?? null],
  );
  return { id };
}

export async function updateProjectTask(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
  patch: { title?: string; status?: string | null; priority?: number | null; description?: string | null },
): Promise<{ ok: true }> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, column] of [["title", "title"], ["status", "status"], ["priority", "priority"], ["description", "description"]] as const) {
    if (patch[key] !== undefined) {
      params.push(patch[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  if (sets.length === 0) return { ok: true };
  params.push(taskId, ctx.orgId);
  await ormSqlConnection(em).execute(
    `UPDATE tasks SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $${params.length - 1} AND org_id = $${params.length}`,
    params,
  );
  return { ok: true };
}

export async function deleteProjectTask(em: EntityManager, ctx: AppContext, taskId: string): Promise<{ ok: true }> {
  await ormSqlConnection(em).execute(
    `UPDATE tasks SET deleted_at = now(), updated_at = now() WHERE id = $1 AND org_id = $2`,
    [taskId, ctx.orgId],
  );
  return { ok: true };
}
