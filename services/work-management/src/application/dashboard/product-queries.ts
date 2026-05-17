import { openDatabase } from "@platform-core/application/db/database-config.ts";
import type { SqlExecutor, SqlValue } from "@platform-core/infrastructure/application-database/sql.ts";

export interface ProjectListing {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  updated_at: string;
}

export interface DocumentListing {
  id: string;
  title: string;
  kind: string;
  updated_at: string;
}

export interface BoardTask {
  id: string;
  title: string;
  status: string;
  priority: number;
  project_id: string | null;
  updated_at: string;
}

export interface RunListing {
  id: string;
  agent: string;
  model: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
}

export interface SprintListing {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  capacity: number | null;
  capacity_points: number | null;
  start_date: string | null;
  end_date: string | null;
  task_count: number;
  total_estimate: number;
  updated_at: string;
}

export interface BacklogTask {
  id: string;
  title: string;
  status: string;
  priority: number;
  estimate_points: number | null;
  sprint_id: string | null;
  project_id: string | null;
  updated_at: string;
}

export interface VelocityPoint {
  sprint_id: string;
  name: string;
  points: number;
}

function isoStamp(value: string | Date | null | undefined): string {
  if (value == null) return "";
  return value instanceof Date ? value.toISOString() : value;
}

async function withDb<T>(fn: (db: SqlExecutor, orgId: string) => Promise<T>): Promise<T> {
  const db = await openDatabase();
  try {
    const org = await defaultOrg(db);
    if (!org) throw new Error("default org not found - run fulcrum init first");
    return await fn(db, org.id);
  } finally {
    await db.close();
  }
}

async function defaultOrg(db: SqlExecutor): Promise<{ id: string } | null> {
  try {
    return (await db.query<{ id: string }>(
      `SELECT id FROM orgs WHERE slug = $1 LIMIT 1`,
      ["default"],
    ))[0] ?? null;
  } catch (error) {
    if (String((error as { code?: unknown }).code) === "42P01" || String(error).includes("relation \"orgs\" does not exist")) {
      return null;
    }
    throw error;
  }
}

function toBoardTask(task: {
  id: string;
  title: string;
  status: string | null;
  priority: number | null;
  project_id: string | null;
  updated_at: string | Date;
}): BoardTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status ?? "pending",
    priority: task.priority ?? 0,
    project_id: task.project_id,
    updated_at: isoStamp(task.updated_at),
  };
}

function toBacklogTask(task: {
  id: string;
  title: string;
  status: string | null;
  priority: number | null;
  estimate_points: number | null;
  sprint_id: string | null;
  project_id: string | null;
  updated_at: string | Date;
}): BacklogTask {
  return {
    id: task.id,
    title: task.title,
    status: task.status ?? "pending",
    priority: task.priority ?? 0,
    estimate_points: task.estimate_points,
    sprint_id: task.sprint_id,
    project_id: task.project_id,
    updated_at: isoStamp(task.updated_at),
  };
}

export async function listProjects(): Promise<ProjectListing[]> {
  return withDb(async (db, orgId) => {
    const projects = await db.query<{ id: string; slug: string | null; name: string; description: string | null; updated_at: string }>(
      `SELECT id, COALESCE(slug, id) AS slug, name, description, updated_at FROM projects WHERE org_id = $1 ORDER BY created_at ASC, id ASC`,
      [orgId],
    );
    return projects.map((project) => ({
    id: project.id,
    slug: project.slug ?? project.id,
    name: project.name,
    description: project.description ?? null,
    updated_at: isoStamp(project.updated_at),
    }));
  });
}

export async function listDocuments(projectId?: string | null): Promise<DocumentListing[]> {
  return withDb(async (db, orgId) => {
    const rows = await db.query<{ id: string; title: string; kind: string; updated_at: string }>(
      `SELECT id, title, kind, updated_at FROM documents WHERE org_id = $1${projectWhere(projectId)} ORDER BY updated_at DESC, id ASC`,
      projectParams(orgId, projectId),
    );
    return rows.map((doc) => ({
      id: doc.id,
      title: doc.title,
      kind: doc.kind,
      updated_at: isoStamp(doc.updated_at),
    }));
  });
}

export async function listBoardTasks(projectId?: string | null): Promise<BoardTask[]> {
  return withDb(async (db, orgId) => {
    const tasks = await db.query<Parameters<typeof toBoardTask>[0]>(
      `SELECT id, title, status, priority, project_id, updated_at FROM tasks WHERE org_id = $1${projectWhere(projectId)} ORDER BY priority DESC, updated_at DESC, id ASC`,
      projectParams(orgId, projectId),
    );
    return tasks.map(toBoardTask);
  });
}

export async function listRuns(projectId?: string | null): Promise<RunListing[]> {
  return withDb(async (db, orgId) => {
    const runs = await db.query<{ id: string; agent: string | null; model: string | null; status: string | null; started_at: string; ended_at: string | null }>(
      `SELECT id, agent, model, status, started_at, ended_at FROM agent_runs WHERE org_id = $1${projectWhere(projectId)} ORDER BY started_at DESC, id ASC`,
      projectParams(orgId, projectId),
    );
    return runs.map((run) => ({
      id: run.id,
      agent: run.agent ?? "",
      model: run.model ?? null,
      status: run.status ?? "",
      started_at: isoStamp(run.started_at),
      ended_at: run.ended_at ? isoStamp(run.ended_at) : null,
    }));
  });
}

export async function listSprintsForProject(projectId: string): Promise<SprintListing[]> {
  return withDb(async (db, orgId) => {
    const sprints = await db.query<{ id: string; name: string; goal: string | null; status: string; capacity_points: number | null; start_date: string | null; end_date: string | null; updated_at: string }>(
      `SELECT id, name, goal, status, capacity_points, start_date, end_date, updated_at FROM sprints WHERE org_id = $1 AND project_id = $2 ORDER BY start_date DESC, id ASC`,
      [orgId, projectId],
    );
    const tasks = await db.query<{ sprint_id: string | null; estimate_points: number | null; estimate: number | null }>(
      `SELECT sprint_id, estimate_points, estimate FROM tasks WHERE org_id = $1 AND project_id = $2`,
      [orgId, projectId],
    );
    return sprints.map((sprint) => ({
    id: sprint.id,
    name: sprint.name,
    goal: sprint.goal,
    status: sprint.status,
    capacity: sprint.capacity_points,
    capacity_points: sprint.capacity_points,
    start_date: sprint.start_date ? isoStamp(sprint.start_date) : null,
    end_date: sprint.end_date ? isoStamp(sprint.end_date) : null,
    task_count: tasks.filter((task) => task.sprint_id === sprint.id).length,
    total_estimate: tasks
      .filter((task) => task.sprint_id === sprint.id)
      .reduce((sum, task) => sum + (task.estimate_points ?? task.estimate ?? 0), 0),
    updated_at: isoStamp(sprint.updated_at),
    }));
  });
}

export const listSprints = listSprintsForProject;

export async function getSprintVelocity(projectId: string): Promise<VelocityPoint[]> {
  return withDb(async (db, orgId) => {
    const sprints = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM sprints WHERE org_id = $1 AND project_id = $2 AND status = 'completed' ORDER BY end_date ASC, updated_at ASC, id ASC`,
      [orgId, projectId],
    );
    const tasks = await db.query<{ sprint_id: string | null; estimate_points: number | null; estimate: number | null }>(
      `SELECT sprint_id, estimate_points, estimate FROM tasks WHERE org_id = $1 AND project_id = $2 AND status = 'completed'`,
      [orgId, projectId],
    );
    return sprints.map((sprint) => ({
    sprint_id: sprint.id,
    name: sprint.name,
    points: tasks
      .filter((task) => task.sprint_id === sprint.id)
      .reduce((sum, task) => sum + (task.estimate_points ?? task.estimate ?? 0), 0),
    }));
  });
}

export async function listBacklog(projectId: string): Promise<BacklogTask[]> {
  return withDb(async (db, orgId) => {
    const tasks = await db.query<Parameters<typeof toBacklogTask>[0]>(
      `SELECT id, title, status, priority, COALESCE(estimate_points, estimate) AS estimate_points, sprint_id, project_id, updated_at
         FROM tasks
        WHERE org_id = $1 AND project_id = $2 AND sprint_id IS NULL AND status NOT IN ('completed', 'cancelled')
        ORDER BY priority DESC, updated_at DESC, id ASC`,
      [orgId, projectId],
    );
    return tasks.map(toBacklogTask);
  });
}

export const listBacklogTasks = listBacklog;

export async function listSprintTasksForBacklog(sprintId: string): Promise<BacklogTask[]> {
  return withDb(async (db, orgId) => {
    const tasks = await db.query<Parameters<typeof toBacklogTask>[0]>(
      `SELECT id, title, status, priority, COALESCE(estimate_points, estimate) AS estimate_points, sprint_id, project_id, updated_at
         FROM tasks
        WHERE org_id = $1 AND sprint_id = $2
        ORDER BY priority DESC, updated_at DESC, id ASC`,
      [orgId, sprintId],
    );
    return tasks.map(toBacklogTask);
  });
}

export const listSprintTasks = listSprintTasksForBacklog;

export function groupTasksByStatus(tasks: readonly BoardTask[]): Record<string, BoardTask[]> {
  const groups: Record<string, BoardTask[]> = {
    pending: [],
    in_progress: [],
    blocked: [],
    completed: [],
    cancelled: [],
  };
  for (const task of tasks) {
    const bucket = groups[task.status] ?? (groups[task.status] = []);
    bucket.push(task);
  }
  return groups;
}

function projectWhere(projectId: string | null | undefined): string {
  if (projectId === undefined) return "";
  if (projectId === null) return " AND project_id IS NULL";
  return " AND project_id = $2";
}

function projectParams(orgId: string, projectId: string | null | undefined): SqlValue[] {
  return projectId === undefined || projectId === null ? [orgId] : [orgId, projectId];
}
