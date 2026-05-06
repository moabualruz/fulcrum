import { openProductDb, type OrmProductDb } from "$lib/server/db";

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

async function open(): Promise<OrmProductDb> {
  return openProductDb();
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function isoStampOrNull(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

interface RawProject { id: string; slug: string; name: string; description: string | null; updated_at: string | Date }
interface RawDocument { id: string; title: string; kind: string; updated_at: string | Date }
interface RawTask { id: string; title: string; status: string; priority: number; project_id: string | null; updated_at: string | Date }

export async function listProjects(): Promise<ProjectListing[]> {
  const db = await open();
  try {
    const rows = await db.query<RawProject>(
      `SELECT id, slug, name, description, updated_at FROM projects ORDER BY created_at ASC, id ASC`,
    );
    return rows.map((r) => ({ ...r, updated_at: isoStamp(r.updated_at) }));
  } finally {
    await db.close();
  }
}

export async function listDocuments(projectId?: string | null): Promise<DocumentListing[]> {
  const db = await open();
  try {
    let rows: RawDocument[];
    if (projectId) {
      rows = await db.query<RawDocument>(
        `SELECT id, title, kind, updated_at FROM documents
          WHERE project_id = $1
          ORDER BY updated_at DESC, id ASC`,
        [projectId],
      );
    } else {
      rows = await db.query<RawDocument>(
        `SELECT id, title, kind, updated_at FROM documents ORDER BY updated_at DESC, id ASC`,
      );
    }
    return rows.map((r) => ({ ...r, updated_at: isoStamp(r.updated_at) }));
  } finally {
    await db.close();
  }
}

export async function listBoardTasks(projectId?: string | null): Promise<BoardTask[]> {
  const db = await open();
  try {
    let rows: RawTask[];
    if (projectId) {
      rows = await db.query<RawTask>(
        `SELECT id, title, status, priority, project_id, updated_at
           FROM tasks WHERE project_id = $1
          ORDER BY priority DESC, updated_at DESC, id ASC`,
        [projectId],
      );
    } else {
      rows = await db.query<RawTask>(
        `SELECT id, title, status, priority, project_id, updated_at
           FROM tasks ORDER BY priority DESC, updated_at DESC, id ASC`,
      );
    }
    return rows.map((r) => ({ ...r, updated_at: isoStamp(r.updated_at) }));
  } finally {
    await db.close();
  }
}

interface RawRun { id: string; agent: string; model: string | null; status: string; started_at: string | Date; ended_at: string | Date | null }

export async function listRuns(projectId?: string | null): Promise<RunListing[]> {
  const db = await open();
  try {
    let rows: RawRun[];
    if (projectId) {
      rows = await db.query<RawRun>(
        `SELECT id, agent, model, status, started_at, ended_at
           FROM agent_runs WHERE project_id = $1
          ORDER BY started_at DESC, id ASC`,
        [projectId],
      );
    } else {
      rows = await db.query<RawRun>(
        `SELECT id, agent, model, status, started_at, ended_at
           FROM agent_runs ORDER BY started_at DESC, id ASC`,
      );
    }
    return rows.map((r) => ({
      ...r,
      started_at: isoStamp(r.started_at),
      ended_at: isoStampOrNull(r.ended_at),
    }));
  } finally {
    await db.close();
  }
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

interface RawSprint { id: string; name: string; goal: string | null; status: string; capacity_points: number | null; start_date: string | Date | null; end_date: string | Date | null; task_count: number | string; total_estimate: number | string | null; updated_at: string | Date }
interface RawBacklogTask { id: string; title: string; status: string; priority: number; estimate_points: number | null; sprint_id: string | null; project_id: string | null; updated_at: string | Date }

export async function listSprintsForProject(projectId: string): Promise<SprintListing[]> {
  const db = await open();
  try {
    const rows = await db.query<RawSprint>(
      `SELECT s.id, s.name, s.goal, s.status, s.capacity_points, s.start_date, s.end_date, s.updated_at,
              count(t.id)::text AS task_count,
              COALESCE(sum(t.estimate_points), 0)::text AS total_estimate
         FROM sprints s
         LEFT JOIN tasks t ON t.sprint_id = s.id
        WHERE s.project_id = $1
        GROUP BY s.id, s.name, s.goal, s.status, s.capacity_points, s.start_date, s.end_date, s.updated_at, s.created_at
        ORDER BY s.created_at DESC, s.id ASC`,
      [projectId],
    );
    return rows.map((r) => ({
      ...r,
      capacity: r.capacity_points,
      task_count: Number(r.task_count ?? 0),
      total_estimate: Number(r.total_estimate ?? 0),
      start_date: r.start_date ? isoStampOrNull(r.start_date as string) : null,
      end_date: r.end_date ? isoStampOrNull(r.end_date as string) : null,
      updated_at: isoStamp(r.updated_at),
    }));
  } finally {
    await db.close();
  }
}

export const listSprints = listSprintsForProject;

export interface VelocityPoint {
  sprint_id: string;
  name: string;
  points: number;
}

export async function getSprintVelocity(projectId: string): Promise<VelocityPoint[]> {
  const db = await open();
  try {
    const rows = await db.query<{ sprint_id: string; name: string; points: number | string | null }>(
      `SELECT s.id AS sprint_id, s.name, COALESCE(sum(t.estimate_points), 0)::text AS points
         FROM sprints s
         LEFT JOIN tasks t ON t.sprint_id = s.id AND t.status = 'completed'
        WHERE s.project_id = $1 AND s.status = 'completed'
        GROUP BY s.id, s.name, s.closed_at, s.updated_at
        ORDER BY COALESCE(s.closed_at, s.updated_at) ASC, s.id ASC`,
      [projectId],
    );
    return rows.map((row) => ({ sprint_id: row.sprint_id, name: row.name, points: Number(row.points ?? 0) }));
  } finally {
    await db.close();
  }
}

export async function listBacklog(projectId: string): Promise<BacklogTask[]> {
  const db = await open();
  try {
    const rows = await db.query<RawBacklogTask>(
      `SELECT id, title, status, priority, estimate_points, sprint_id, project_id, updated_at
         FROM tasks
         WHERE project_id = $1
           AND sprint_id IS NULL
           AND status NOT IN ('completed', 'cancelled')
         ORDER BY priority DESC, updated_at DESC, id ASC`,
      [projectId],
    );
    return rows.map((r) => ({ ...r, updated_at: isoStamp(r.updated_at) }));
  } finally {
    await db.close();
  }
}

export async function listSprintTasksForBacklog(sprintId: string): Promise<BacklogTask[]> {
  const db = await open();
  try {
    const rows = await db.query<RawBacklogTask>(
      `SELECT id, title, status, priority, estimate_points, sprint_id, project_id, updated_at
         FROM tasks
         WHERE sprint_id = $1
         ORDER BY priority DESC, updated_at DESC, id ASC`,
      [sprintId],
    );
    return rows.map((r) => ({ ...r, updated_at: isoStamp(r.updated_at) }));
  } finally {
    await db.close();
  }
}

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
