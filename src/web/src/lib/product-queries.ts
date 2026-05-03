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
  description_text?: string | null;
  tiptap_content?: unknown;
  assignee?: string | null;
  avatar_url?: string | null;
  labels?: string[];
  blocked?: boolean;
  points?: number | null;
  sprint_id?: string | null;
  sprint_name?: string | null;
  due_date?: string | null;
  epic?: string | null;
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
interface RawTask {
  id: string;
  title: string;
  status: string;
  priority: number;
  project_id: string | null;
  updated_at: string | Date;
  due_date?: string | Date | null;
}

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
    await db.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date date`);
    let rows: RawTask[];
    if (projectId) {
      rows = await db.query<RawTask>(
        `SELECT id, title, status, priority, project_id, updated_at, due_date
           FROM tasks WHERE project_id = $1
          ORDER BY priority DESC, updated_at DESC, id ASC`,
        [projectId],
      );
    } else {
      rows = await db.query<RawTask>(
        `SELECT id, title, status, priority, project_id, updated_at, due_date
           FROM tasks ORDER BY priority DESC, updated_at DESC, id ASC`,
      );
    }
    return rows.map((r) => ({
      ...r,
      updated_at: isoStamp(r.updated_at),
      due_date: isoStampOrNull(r.due_date ?? null)?.slice(0, 10) ?? null,
    }));
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
