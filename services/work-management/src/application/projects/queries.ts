import type { EntityManager } from "typeorm";

import { ormSqlConnection } from "@platform-core/application/orm-helpers.ts";
import type { AppContext } from "@work-management/application/tasks/types.ts";

export interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  parentId?: string | null;
  kind?: string;
  path?: string;
  depth?: number;
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

export interface ProjectHierarchyNode {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  kind: string;
  path: string;
  depth: number;
}

export interface ProjectListing {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  updated_at: string;
  task_count: number;
  open_task_count: number;
  doc_count: number;
  latest_activity_at: string;
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
  const slugExpr = columns.has("slug") ? "COALESCE(p.slug, p.id::text)" : "p.id::text";
  const descriptionExpr = columns.has("description") ? "p.description" : "NULL::text";
  const rows = await ormSqlConnection(em).execute<Array<{
    id: string;
    slug: string | null;
    name: string;
    description: string | null;
    updated_at: string | Date;
    task_count: number | string;
    open_task_count: number | string;
    doc_count: number | string;
    latest_activity_at: string | Date;
  }>>(
    `SELECT
        p.id,
        ${slugExpr} AS slug,
        p.name,
        ${descriptionExpr} AS description,
        p.updated_at,
        (SELECT COUNT(*) FROM tasks t WHERE t.org_id = p.org_id AND t.project_id = p.id::text) AS task_count,
        (
          SELECT COUNT(*)
            FROM tasks t
           WHERE t.org_id = p.org_id
             AND t.project_id = p.id::text
             AND COALESCE(t.status, '') NOT IN ('completed', 'done', 'canceled', 'cancelled')
        ) AS open_task_count,
        (SELECT COUNT(*) FROM documents d WHERE d.org_id = p.org_id AND d.project_id = p.id::text AND d.archived = false) AS doc_count,
        GREATEST(
          p.updated_at,
          COALESCE((SELECT MAX(t.updated_at) FROM tasks t WHERE t.org_id = p.org_id AND t.project_id = p.id::text), p.updated_at),
          COALESCE((SELECT MAX(d.updated_at) FROM documents d WHERE d.org_id = p.org_id AND d.project_id = p.id::text), p.updated_at)
        ) AS latest_activity_at
       FROM projects p
      WHERE p.org_id = $1
      ORDER BY p.created_at ASC, p.id ASC`,
    [ctx.orgId],
  );
  return rows.map((project) => ({
    id: project.id,
    slug: project.slug ?? project.id,
    name: project.name,
    description: project.description ?? null,
    updated_at: isoStamp(project.updated_at),
    task_count: Number(project.task_count),
    open_task_count: Number(project.open_task_count),
    doc_count: Number(project.doc_count),
    latest_activity_at: isoStamp(project.latest_activity_at),
  }));
}

export async function resolveProjectIdByKey(
  em: EntityManager,
  ctx: AppContext,
  projectKey: string | null,
): Promise<string | null> {
  if (!projectKey) return null;
  const idPredicate = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectKey)
    ? " OR id::text = $2"
    : "";
  const rows = await ormSqlConnection(em).execute<Array<{ id: string }>>(
    `SELECT id FROM projects WHERE org_id = $1 AND (slug = $2${idPredicate}) LIMIT 1`,
    [ctx.orgId, projectKey],
  );
  return rows[0]?.id ?? null;
}

export async function getProjectHierarchy(
  em: EntityManager,
  ctx: AppContext,
  projectId: string,
): Promise<{ project: ProjectHierarchyNode; descendants: ProjectHierarchyNode[] } | null> {
  const conn = ormSqlConnection(em);
  const projectRows = await conn.execute<Array<ProjectHierarchyNode & { parent_id: string | null }>>(
    `SELECT id, slug, name, parent_id, kind, COALESCE(path, slug) AS path, depth
       FROM projects
      WHERE id = $1 AND org_id = $2`,
    [projectId, ctx.orgId],
  );
  const project = projectRows[0];
  if (!project) return null;
  const descendants = await conn.execute<Array<ProjectHierarchyNode & { parent_id: string | null }>>(
    `SELECT id, slug, name, parent_id, kind, COALESCE(path, slug) AS path, depth
       FROM projects
      WHERE org_id = $1
        AND COALESCE(path, slug) LIKE $2
        AND id <> $3
      ORDER BY depth ASC, path ASC`,
    [ctx.orgId, `${project.path}/%`, project.id],
  );
  return {
    project: mapHierarchyNode(project),
    descendants: descendants.map(mapHierarchyNode),
  };
}

export async function listProjectOptions(em: EntityManager, ctx: AppContext): Promise<ProjectOption[]> {
  const rows = await ormSqlConnection(em).execute<ProjectOption[]>(
    `SELECT id, name
       FROM projects
      WHERE org_id = $1
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
    `SELECT id, ${slugExpr} AS slug, name FROM projects WHERE id = $1 AND org_id = $2`,
    [projectId, ctx.orgId],
  );
  return rows[0] ?? null;
}

export async function loadProjectOverview(
  em: EntityManager,
  ctx: AppContext,
  projectId: string,
  options: { includeDescendants?: boolean } = {},
): Promise<ProjectOverviewData | null> {
  const conn = ormSqlConnection(em);
  const rows = await conn.execute<Array<ProjectRow & { description: string | null; updated_at: Date | string }>>(
    `SELECT id, slug, name, description, updated_at FROM projects
       WHERE id = $1 AND org_id = $2`,
    [projectId, ctx.orgId],
  );
  const row = rows[0];
  if (!row) return null;
  const targetProjectIds = options.includeDescendants ? await descendantProjectIds(em, ctx, projectId) : [projectId];
  const projectPlaceholders = targetProjectIds.map((_, index) => `$${index + 1}`).join(", ");
  const summaryRows = await conn.execute<Array<{ open_tasks: number | string; in_progress: number | string; done: number | string }>>(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled')) AS open_tasks,
       COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
       COUNT(*) FILTER (WHERE status = 'completed') AS done
     FROM tasks
     WHERE project_id IN (${projectPlaceholders}) AND org_id = $${targetProjectIds.length + 1}`,
    [...targetProjectIds, ctx.orgId],
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

async function descendantProjectIds(em: EntityManager, ctx: AppContext, projectId: string): Promise<string[]> {
  const hierarchy = await getProjectHierarchy(em, ctx, projectId);
  return hierarchy ? [hierarchy.project.id, ...hierarchy.descendants.map((node) => node.id)] : [projectId];
}

function mapHierarchyNode(row: ProjectHierarchyNode & { parent_id?: string | null }): ProjectHierarchyNode {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    parentId: row.parent_id ?? row.parentId ?? null,
    kind: row.kind,
    path: row.path,
    depth: Number(row.depth),
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
    const relationshipColumns = await taskRelationshipColumns(em);
    const relationshipDeletedPredicate = relationshipColumns.has("deleted_at")
      ? "AND (r.deleted_at IS NULL OR r.deleted_at > now())"
      : "";
    const rows = await conn.execute<Array<{ id: string; source_task_id: string; target_task_id: string; type: string }>>(
      `SELECT r.id, r.source_task_id, r.target_task_id, r.type
         FROM task_relationships r
         INNER JOIN tasks t ON t.id::text = r.source_task_id
        WHERE t.project_id = $1
          ${relationshipDeletedPredicate}`,
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
  const rows = await ormSqlConnection(em).execute<Array<{ column_name: string }>>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'projects'`,
  );
  return new Set(rows.map((row) => row.column_name));
}

async function taskRelationshipColumns(em: EntityManager): Promise<Set<string>> {
  const rows = await ormSqlConnection(em).execute<Array<{ column_name: string }>>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'task_relationships'`,
  );
  return new Set(rows.map((row) => row.column_name));
}
