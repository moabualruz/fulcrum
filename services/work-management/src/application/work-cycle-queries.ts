import type { EntityManager } from "@mikro-orm/postgresql";

import { Sprint } from "@platform-core/infrastructure/application-database/entities/tasks/Sprint.ts";
import { WorkCycleService } from "@work-management/application/work-cycle-service.ts";
import { AppForbiddenError, AppNotFoundError } from "@platform-core/domain/errors.ts";
import { getProjectOrNull, listProjectBoardTasks, type BoardTaskRow } from "@work-management/application/projects/queries.ts";
import { ormSqlConnection } from "@platform-core/application/orm-helpers.ts";
import type { AppContext, ListSprintsInput, SprintDto } from "@work-management/domain/work-cycle.ts";

export async function listSprints(em: EntityManager, ctx: AppContext, input?: ListSprintsInput): Promise<SprintDto[]> {
  return new WorkCycleService(em).list(ctx.orgId, input);
}

export async function getSprint(em: EntityManager, ctx: AppContext, id: string): Promise<SprintDto | null> {
  const sprint = await em.findOne(Sprint, { id } as never);
  if (!sprint) throw new AppNotFoundError(`Sprint not found: ${id}`);
  if (sprint.org.id !== ctx.orgId) throw new AppForbiddenError("Sprint is outside org scope.");
  return new WorkCycleService(em).get(ctx.orgId, id);
}

export async function getCapacityPreview(
  em: EntityManager,
  ctx: AppContext,
  sprintId: string,
): Promise<{ assigned: number; capacity: number | null; percentage: number | null }> {
  return new WorkCycleService(em).getCapacityPreview(ctx.orgId, sprintId);
}

export interface SprintListRow {
  id: string;
  name: string;
  status: string;
  capacity_points: number | null;
}

export interface BacklogTaskRow {
  id: string;
  title: string;
  status: string;
  priority: number;
  estimate_points: number | null;
  sprint_id: string | null;
}

export async function loadProjectBacklog(
  em: EntityManager,
  ctx: AppContext,
): Promise<{ project: { id: string; name: string }; sprints: SprintListRow[]; backlogTasks: BacklogTaskRow[] }> {
  const projectId = ctx.projectId ?? "";
  const project = await getProjectOrNull(em, ctx, projectId);
  if (!project) throw new Error("Project not found");
  const conn = ormSqlConnection(em);
  const sprints = await conn.execute<SprintListRow[]>(
    `SELECT id, name, status, capacity_points
       FROM sprints WHERE project_id = $1 ORDER BY created_at DESC, id ASC`,
    [projectId],
  );
  const backlogTasks = await conn.execute<BacklogTaskRow[]>(
    `SELECT id, title, status, priority, points AS estimate_points, sprint_id
       FROM tasks
      WHERE project_id = $1 AND sprint_id IS NULL
        AND status NOT IN ('completed', 'cancelled')
      ORDER BY priority DESC, updated_at DESC, id ASC`,
    [projectId],
  );
  return { project: { id: project.id, name: project.name }, sprints, backlogTasks };
}

export async function loadProjectSprints(
  em: EntityManager,
  ctx: AppContext,
): Promise<{ sprints: SprintListRow[]; velocity: Array<Record<string, unknown>> }> {
  const sprints = await ormSqlConnection(em).execute<SprintListRow[]>(
    `SELECT id, name, status, capacity_points
       FROM sprints WHERE project_id = $1 ORDER BY created_at DESC, id ASC`,
    [ctx.projectId ?? null],
  );
  return { sprints, velocity: [] };
}

export async function loadProjectSprintDetail(
  em: EntityManager,
  ctx: AppContext,
  sprintId: string,
): Promise<{ project: { id: string; name: string }; sprint: { id: string; name: string; goal: string | null; start_date: string; end_date: string; status: string }; tasks: BoardTaskRow[] }> {
  const projectId = ctx.projectId ?? "";
  const project = await getProjectOrNull(em, ctx, projectId);
  if (!project) throw new Error("Project not found");
  const rows = await ormSqlConnection(em).execute<Array<{ id: string; name: string; goal: string | null; start_date: string | Date; end_date: string | Date; status: string }>>(
    `SELECT id, name, goal, start_date, end_date, status
       FROM sprints
      WHERE id = $1 AND project_id = $2`,
    [sprintId, projectId],
  );
  const row = rows[0];
  if (!row) throw new Error("Sprint not found");
  const allTasks = await listProjectBoardTasks(em, ctx);
  return {
    project: { id: project.id, name: project.name },
    sprint: {
      id: row.id,
      name: row.name,
      goal: row.goal,
      start_date: dateOnly(row.start_date),
      end_date: dateOnly(row.end_date),
      status: row.status,
    },
    tasks: allTasks.filter((task) => task.sprint_id === sprintId),
  };
}

function dateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
