import type { EntityManager } from "@mikro-orm/postgresql";

import { ormSqlConnection } from "../orm-helpers.ts";
import type { AppContext } from "../tasks/types.ts";

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
