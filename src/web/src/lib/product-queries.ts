import { join } from "node:path";
import { openPglite } from "../../../product-kernel/db/pglite.ts";
import { runMigrations } from "../../../product-kernel/db/migrate.ts";
import { productDbDir } from "../../../product-kernel/paths.ts";
import type { ProductDb } from "../../../product-kernel/db/types.ts";

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
  assignee?: string | null;
  due_date?: string | null;
  estimate?: number | null;
  labels?: string[];
}

export interface RunListing {
  id: string;
  agent: string;
  model: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
}

async function open(): Promise<ProductDb> {
  const db = await openPglite(join(productDbDir(), "main"));
  await runMigrations(db);
  return db;
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
  capacity: number;
  start_date: string | null;
  end_date: string | null;
  total_estimate: number;
  task_count: number;
}

export interface BacklogTask extends BoardTask {
  estimate: number;
  sprint_id: string | null;
}

interface RawSprint {
  id: string; name: string; goal: string | null; status: string;
  capacity: number; start_date: string | Date | null; end_date: string | Date | null;
  total_estimate: number; task_count: number;
}

interface RawBacklogTask extends RawTask {
  estimate: number;
  sprint_id: string | null;
}

export async function listSprints(projectId: string): Promise<SprintListing[]> {
  const db = await open();
  try {
    const rows = await db.query<RawSprint>(
      `SELECT s.id, s.name, s.goal, s.status, s.capacity, s.start_date, s.end_date,
              COALESCE(SUM(t.estimate), 0)::int AS total_estimate,
              COUNT(t.id)::int AS task_count
         FROM sprints s
         LEFT JOIN tasks t ON t.sprint_id = s.id
        WHERE s.project_id = $1
        GROUP BY s.id
        ORDER BY s.created_at ASC, s.id ASC`,
      [projectId],
    );
    return rows.map((r) => ({
      ...r,
      start_date: isoStampOrNull(r.start_date),
      end_date: isoStampOrNull(r.end_date),
    }));
  } finally {
    await db.close();
  }
}

export async function listBacklogTasks(projectId: string): Promise<BacklogTask[]> {
  const db = await open();
  try {
    const rows = await db.query<RawBacklogTask>(
      `SELECT id, title, status, priority, project_id, updated_at, estimate, sprint_id
         FROM tasks
        WHERE project_id = $1 AND sprint_id IS NULL
        ORDER BY priority DESC, updated_at DESC, id ASC`,
      [projectId],
    );
    return rows.map((r) => ({ ...r, updated_at: isoStamp(r.updated_at) }));
  } finally {
    await db.close();
  }
}

export async function listSprintTasks(sprintId: string): Promise<BacklogTask[]> {
  const db = await open();
  try {
    const rows = await db.query<RawBacklogTask>(
      `SELECT id, title, status, priority, project_id, updated_at, estimate, sprint_id
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

export async function getSprintVelocity(projectId: string): Promise<{ sprintName: string; points: number }[]> {
  const db = await open();
  try {
    const rows = await db.query<{ name: string; points: number }>(
      `SELECT s.name, COALESCE(SUM(t.estimate), 0)::int AS points
         FROM sprints s
         LEFT JOIN tasks t ON t.sprint_id = s.id AND t.status = 'completed'
        WHERE s.project_id = $1 AND s.status = 'completed'
        GROUP BY s.id, s.name, s.created_at
        ORDER BY s.created_at DESC
        LIMIT 5`,
      [projectId],
    );
    return rows.map((r) => ({ sprintName: r.name, points: r.points }));
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
