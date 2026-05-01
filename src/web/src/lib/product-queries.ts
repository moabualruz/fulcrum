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

export async function listProjects(): Promise<ProjectListing[]> {
  const db = await open();
  try {
    return await db.query<ProjectListing>(
      `SELECT id, slug, name, description, updated_at FROM projects ORDER BY created_at ASC, id ASC`,
    );
  } finally {
    await db.close();
  }
}

export async function listDocuments(projectId?: string | null): Promise<DocumentListing[]> {
  const db = await open();
  try {
    if (projectId) {
      return await db.query<DocumentListing>(
        `SELECT id, title, kind, updated_at FROM documents
          WHERE project_id = $1
          ORDER BY updated_at DESC, id ASC`,
        [projectId],
      );
    }
    return await db.query<DocumentListing>(
      `SELECT id, title, kind, updated_at FROM documents ORDER BY updated_at DESC, id ASC`,
    );
  } finally {
    await db.close();
  }
}

export async function listBoardTasks(projectId?: string | null): Promise<BoardTask[]> {
  const db = await open();
  try {
    if (projectId) {
      return await db.query<BoardTask>(
        `SELECT id, title, status, priority, project_id, updated_at
           FROM tasks WHERE project_id = $1
          ORDER BY priority DESC, updated_at DESC, id ASC`,
        [projectId],
      );
    }
    return await db.query<BoardTask>(
      `SELECT id, title, status, priority, project_id, updated_at
         FROM tasks ORDER BY priority DESC, updated_at DESC, id ASC`,
    );
  } finally {
    await db.close();
  }
}

export async function listRuns(projectId?: string | null): Promise<RunListing[]> {
  const db = await open();
  try {
    if (projectId) {
      return await db.query<RunListing>(
        `SELECT id, agent, model, status, started_at, ended_at
           FROM agent_runs WHERE project_id = $1
          ORDER BY started_at DESC, id ASC`,
        [projectId],
      );
    }
    return await db.query<RunListing>(
      `SELECT id, agent, model, status, started_at, ended_at
         FROM agent_runs ORDER BY started_at DESC, id ASC`,
    );
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
