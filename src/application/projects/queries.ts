import type { EntityManager } from "@mikro-orm/postgresql";

import { ormSqlConnection } from "../orm-helpers.ts";
import type { AppContext } from "../tasks/types.ts";

export interface ProjectRow {
  id: string;
  slug: string;
  name: string;
}

export interface ProjectActivityFilter {
  subjectKind?: string;
  verb?: string;
  actorId?: string;
  limit?: number;
}

export interface ProjectEventRow {
  id: string;
  org_id: string;
  project_id: string | null;
  actor: string;
  subject_kind: string;
  subject_id: string;
  verb: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ProjectTimelineTask {
  id: string;
  title: string;
  status: string | null;
  priority: number | null;
  start_date: string | null;
  due_date: string | null;
  created_at?: string;
  updated_at: string;
  sprint_id?: string | null;
}

export interface ProjectTimelineSprint {
  id: string;
  name: string | null;
  start_date: string;
  end_date: string;
}

export interface TaskRelationshipDto {
  id: string;
  sourceTaskId: string;
  targetTaskId: string;
  type: string;
}

export interface ProjectOverviewData {
  project: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    updated_at: string;
  };
  summary: {
    openTasks: number;
    inProgress: number;
    done: number;
    sprintDaysRemaining: number;
  };
}

export interface ProjectListing {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  updated_at: string;
}

export interface ProjectOption {
  id: string;
  name: string;
}

export interface BoardTaskRow {
  id: string;
  title: string;
  status: string | null;
  priority: number | null;
  project_id: string | null;
  sprint_id?: string | null;
  updated_at: string;
}

export async function listProjectRows(em: EntityManager, ctx: AppContext): Promise<ProjectListing[]> {
  const columns = await projectColumns(em);
  const slugExpr = columns.has("slug") ? "COALESCE(slug, id::text)" : "id::text";
  const descriptionExpr = columns.has("description") ? "description" : "NULL::text";
  const rows = await ormSqlConnection(em).execute<Array<{
    id: string;
    slug: string | null;
    name: string;
    description: string | null;
    updated_at: string | Date;
  }>>(
    `SELECT id, ${slugExpr} AS slug, name, ${descriptionExpr} AS description, updated_at
       FROM projects
      WHERE org_id = ?
      ORDER BY created_at ASC, id ASC`,
    [ctx.orgId],
  );
  return rows.map((project) => ({
    id: project.id,
    slug: project.slug ?? project.id,
    name: project.name,
    description: project.description ?? null,
    updated_at: isoStamp(project.updated_at),
  }));
}

export async function listProjectOptions(em: EntityManager, ctx: AppContext): Promise<ProjectOption[]> {
  const rows = await ormSqlConnection(em).execute<ProjectOption[]>(
    `SELECT id, name
       FROM projects
      WHERE org_id = ?
      ORDER BY name ASC, id ASC`,
    [ctx.orgId],
  );
  return rows;
}

export async function getProjectOrNull(
  em: EntityManager,
  ctx: AppContext,
  projectId: string,
): Promise<ProjectRow | null> {
  const columns = await projectColumns(em);
  const slugExpr = columns.has("slug") ? "COALESCE(slug, id::text)" : "id::text";
  const rows = await ormSqlConnection(em).execute<ProjectRow[]>(
    `SELECT id, ${slugExpr} AS slug, name FROM projects WHERE id = ? AND org_id = ?`,
    [projectId, ctx.orgId],
  );
  return rows[0] ?? null;
}

export async function loadProjectOverview(em: EntityManager, ctx: AppContext, projectId: string): Promise<ProjectOverviewData | null> {
  const conn = ormSqlConnection(em);
  const rows = await conn.execute<Array<ProjectRow & { description: string | null; updated_at: Date | string }>>(
    `SELECT id, slug, name, description, updated_at FROM projects
       WHERE id = $1 AND org_id = $2`,
    [projectId, ctx.orgId],
  );
  const row = rows[0];
  if (!row) return null;
  const summaryRows = await conn.execute<Array<{ open_tasks: number | string; in_progress: number | string; done: number | string }>>(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled')) AS open_tasks,
       COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
       COUNT(*) FILTER (WHERE status = 'completed') AS done
     FROM tasks
     WHERE project_id = $1 AND org_id = $2`,
    [projectId, ctx.orgId],
  );
  const summary = summaryRows[0] ?? { open_tasks: 0, in_progress: 0, done: 0 };
  return {
    project: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      updated_at: isoStamp(row.updated_at),
    },
    summary: {
      openTasks: Number(summary.open_tasks),
      inProgress: Number(summary.in_progress),
      done: Number(summary.done),
      sprintDaysRemaining: 0,
    },
  };
}

export async function listProjectBoardTasks(em: EntityManager, ctx: AppContext): Promise<BoardTaskRow[]> {
  const rows = await ormSqlConnection(em).execute<BoardTaskRow[]>(
    `SELECT id, title, status, priority, project_id, sprint_id, updated_at
       FROM tasks
      WHERE org_id = $1
        AND project_id = $2
        AND deleted_at IS NULL
      ORDER BY updated_at DESC, id ASC`,
    [ctx.orgId, ctx.projectId ?? null],
  );
  return rows.map((task) => ({
    ...task,
    updated_at: isoStamp(task.updated_at),
  }));
}

export async function listProjectActivityEvents(
  em: EntityManager,
  ctx: AppContext,
  filter: ProjectActivityFilter = {},
): Promise<ProjectEventRow[]> {
  const params: unknown[] = [ctx.orgId, ctx.projectId ?? null];
  const predicates = ["org_id = $1", "project_id = $2"];
  if (filter.subjectKind) {
    params.push(filter.subjectKind);
    predicates.push(`subject_kind = $${params.length}`);
  }
  if (filter.verb) {
    params.push(filter.verb);
    predicates.push(`verb = $${params.length}`);
  }
  if (filter.actorId) {
    params.push(filter.actorId);
    predicates.push(`actor = $${params.length}`);
  }
  params.push(filter.limit ?? 20);
  const rows = await ormSqlConnection(em).execute<ProjectEventRow[]>(
    `SELECT id, org_id, project_id, actor, subject_kind, subject_id, verb, payload, created_at
       FROM events
      WHERE ${predicates.join(" AND ")}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows.map((event) => ({
    ...event,
    created_at: isoStamp(event.created_at),
  }));
}

export async function loadProjectCalendar(
  em: EntityManager,
  ctx: AppContext,
): Promise<{ projectId: string; project: { id: string }; tasks: ProjectTimelineTask[]; activeSprint: ProjectTimelineSprint | null }> {
  const projectId = requireProjectId(ctx);
  const conn = ormSqlConnection(em);
  const tasks = await conn.execute<ProjectTimelineTask[]>(
    `SELECT t.id, t.title, t.status, t.priority,
            NULL::text AS start_date,
            NULL::text AS due_date,
            t.updated_at
       FROM tasks t
      WHERE t.project_id = $1
        AND t.deleted_at IS NULL
      ORDER BY t.created_at`,
    [projectId],
  );

  let activeSprint: ProjectTimelineSprint | null = null;
  try {
    const sprints = await conn.execute<Array<{ id: string; name: string | null; start_date: string | null; end_date: string | null }>>(
      `SELECT s.id, s.name, s.start_date, s.end_date
         FROM sprints s
        WHERE s.project_id = $1
          AND s.status = 'active'
        ORDER BY s.start_date DESC
        LIMIT 1`,
      [projectId],
    );
    const sprint = sprints[0];
    if (sprint?.start_date && sprint.end_date) {
      activeSprint = {
        id: sprint.id,
        name: sprint.name ?? null,
        start_date: dateOnly(sprint.start_date),
        end_date: dateOnly(sprint.end_date),
      };
    }
  } catch {
    activeSprint = null;
  }

  return { projectId, project: { id: projectId }, tasks, activeSprint };
}

export async function loadProjectGantt(
  em: EntityManager,
  ctx: AppContext,
): Promise<{ projectId: string; project: { id: string }; tasks: ProjectTimelineTask[]; relationships: TaskRelationshipDto[] }> {
  const projectId = requireProjectId(ctx);
  const conn = ormSqlConnection(em);
  const tasks = await conn.execute<ProjectTimelineTask[]>(
    `SELECT t.id, t.title, t.status, t.priority,
            NULL::text AS start_date,
            NULL::text AS due_date,
            t.created_at, t.updated_at,
            t.sprint_id
       FROM tasks t
      WHERE t.project_id = $1
        AND t.deleted_at IS NULL
      ORDER BY t.created_at`,
    [projectId],
  );

  let relationships: TaskRelationshipDto[] = [];
  try {
    const rows = await conn.execute<Array<{ id: string; source_task_id: string; target_task_id: string; type: string }>>(
      `SELECT r.id, r.source_task_id, r.target_task_id, r.type
         FROM task_relationships r
         INNER JOIN tasks t ON t.id = r.source_task_id
        WHERE t.project_id = $1
          AND (r.deleted_at IS NULL OR r.deleted_at > now())`,
      [projectId],
    );
    relationships = rows.map((row) => ({
      id: row.id,
      sourceTaskId: row.source_task_id,
      targetTaskId: row.target_task_id,
      type: row.type,
    }));
  } catch {
    relationships = [];
  }

  return { projectId, project: { id: projectId }, tasks, relationships };
}

function requireProjectId(ctx: AppContext): string {
  if (!ctx.projectId) throw new Error("projectId required");
  return ctx.projectId;
}

function dateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

async function projectColumns(em: EntityManager): Promise<Set<string>> {
  const rows = await em.getKysely<any>()
    .selectFrom("information_schema.columns")
    .select(["column_name"])
    .where("table_schema", "=", "public")
    .where("table_name", "=", "projects")
    .execute() as Array<{ column_name: string }>;
  return new Set(rows.map((row) => row.column_name));
}
