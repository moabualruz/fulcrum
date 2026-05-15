import type { EntityManager } from "@mikro-orm/postgresql";

import { randomUUID } from "node:crypto";
import { WorkCycleService } from "@work-management/application/work-cycle-service.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";
import { ormSqlConnection } from "@platform-core/application/orm-helpers.ts";
import type {
  AppContext,
  CloseSprintDto,
  CloseSprintInput,
  CreateSprintInput,
  SprintDto,
  UpdateSprintInput,
} from "@work-management/domain/work-cycle.ts";

export async function createSprint(em: EntityManager, ctx: AppContext, input: CreateSprintInput): Promise<SprintDto> {
  if (!input.name?.trim()) throw new AppValidationError("Sprint name is required.");
  if (!input.projectId) throw new AppValidationError("Sprint projectId is required.");
  if (input.startDate >= input.endDate) throw new AppValidationError("Sprint startDate must be before endDate.");
  return new WorkCycleService(em).create(ctx.orgId, input);
}

export async function updateSprint(em: EntityManager, ctx: AppContext, input: UpdateSprintInput): Promise<SprintDto | null> {
  return new WorkCycleService(em).update(ctx.orgId, input);
}

export async function deleteSprint(em: EntityManager, ctx: AppContext, id: string): Promise<SprintDto | null> {
  return new WorkCycleService(em).delete(ctx.orgId, id);
}

export async function startSprint(em: EntityManager, ctx: AppContext, id: string): Promise<SprintDto> {
  return new WorkCycleService(em).start({ orgId: ctx.orgId, em }, id);
}

export async function closeSprint(em: EntityManager, ctx: AppContext, input: CloseSprintInput): Promise<CloseSprintDto> {
  return new WorkCycleService(em).close({ orgId: ctx.orgId, em }, input);
}

export async function addTaskToSprint(
  em: EntityManager,
  ctx: AppContext,
  sprintId: string,
  taskId: string,
): Promise<{ moved: true }> {
  return new WorkCycleService(em).addTask(ctx.orgId, sprintId, taskId);
}

export async function removeTaskFromSprint(
  em: EntityManager,
  ctx: AppContext,
  sprintId: string,
  taskId: string,
): Promise<{ moved: true }> {
  return new WorkCycleService(em).removeTask(ctx.orgId, sprintId, taskId);
}

export async function createProjectSprint(
  em: EntityManager,
  ctx: AppContext,
  input: { name: string; goal?: string | null; capacity?: number | null },
): Promise<{ id: string }> {
  const id = randomUUID();
  const now = new Date();
  const end = new Date(now.getTime() + 14 * 86400000);
  await ormSqlConnection(em).execute(
    `INSERT INTO sprints (id, org_id, project_id, name, goal, status, capacity_points, start_date, end_date, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'planning', $6, $7, $8, now(), now())`,
    [id, ctx.orgId, ctx.projectId ?? null, input.name, input.goal ?? null, input.capacity ?? null, now.toISOString(), end.toISOString()],
  );
  return { id };
}

export async function startProjectSprint(em: EntityManager, ctx: AppContext, sprintId: string): Promise<{ ok: true }> {
  await ormSqlConnection(em).execute(
    `UPDATE sprints SET status = 'active', updated_at = now() WHERE id = $1 AND org_id = $2`,
    [sprintId, ctx.orgId],
  );
  return { ok: true };
}

export async function completeProjectSprint(
  em: EntityManager,
  ctx: AppContext,
  sprintId: string,
): Promise<{ id: string; metrics: { velocity: number; completed_tasks: number } }> {
  const conn = ormSqlConnection(em);
  await conn.execute(`UPDATE sprints SET status = 'completed', updated_at = now() WHERE id = $1 AND org_id = $2`, [sprintId, ctx.orgId]);
  await conn.execute(
    `UPDATE tasks SET sprint_id = NULL, updated_at = now() WHERE sprint_id = $1 AND status NOT IN ('completed', 'cancelled')`,
    [sprintId],
  );
  return { id: sprintId, metrics: { velocity: 0, completed_tasks: 0 } };
}

export async function updateSprintGoal(em: EntityManager, ctx: AppContext, sprintId: string, goal: string): Promise<{ ok: true }> {
  await ormSqlConnection(em).execute(
    `UPDATE sprints SET goal = $1, updated_at = now() WHERE id = $2 AND org_id = $3`,
    [goal, sprintId, ctx.orgId],
  );
  return { ok: true };
}
