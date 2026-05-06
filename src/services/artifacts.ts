/**
 * Artifact service — pure DB operations for artifact CRUD.
 * Canonical home; web layer re-exports from here.
 * Dependency direction: services use neutral persistence protocols (never web).
 */
import type { EntityManager } from "@mikro-orm/postgresql";
import type { SqlExecutor } from "../db/sql.ts";

type DbHandle = EntityManager | { em?: EntityManager } | SqlExecutor;

export interface ArtifactRow {
  id: string;
  org_id: string;
  project_id: string | null;
  run_id: string | null;
  task_id: string | null;
  kind: string;
  title: string;
  body_path: string | null;
  sha256: string | null;
  size: number | null;
  mime: string | null;
  archived: boolean;
  created_at: string;
}

export interface ArtifactFilter {
  projectId?: string;
  runId?: string;
  taskId?: string;
  mime?: string;
  kind?: string;
}

export interface ArtifactStats {
  totalBytes: number;
  count: number;
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function assertEm(db: DbHandle) {
  if ("persist" in db && typeof (db as { persist: unknown }).persist === "function") {
    return db as EntityManager;
  }
  if ("em" in db) {
    const em = (db as { em?: unknown }).em;
    if (em && typeof (em as { persist?: unknown }).persist === "function") {
      return em as EntityManager;
    }
  }
  throw new Error("artifacts.ts: EntityManager required for this operation.");
}

function isSqlExecutor(db: DbHandle): db is SqlExecutor {
  return !("em" in db) && "query" in db && typeof (db as { query: unknown }).query === "function";
}

export async function listArtifacts(
  db: DbHandle,
  orgId: string,
  filter?: ArtifactFilter & { includeArchived?: boolean },
): Promise<ArtifactRow[]> {
  if (isSqlExecutor(db)) {
    const conditions = ["org_id = $1"];
    const params: (string | null)[] = [orgId];
    const push = (condition: string, value: string) => {
      params.push(value);
      conditions.push(condition.replace("?", `$${params.length}`));
    };
    if (!filter?.includeArchived) conditions.push("(archived = false OR archived IS NULL)");
    if (filter?.projectId) push("project_id = ?", filter.projectId);
    if (filter?.runId) push("run_id = ?", filter.runId);
    if (filter?.taskId) push("task_id = ?", filter.taskId);
    if (filter?.mime) push("mime = ?", filter.mime);
    if (filter?.kind) push("kind = ?", filter.kind);
    const rows = await db.query<ArtifactRow & { created_at: string | Date }>(
      `SELECT id, org_id, project_id, run_id, task_id, kind, title,
              body_path, sha256, size, mime, COALESCE(archived, false) AS archived, created_at
         FROM artifacts
        WHERE ${conditions.join(" AND ")}
        ORDER BY created_at DESC, id ASC`,
      params,
    );
    return rows.map((r) => ({
      ...r,
      archived: Boolean(r.archived),
      created_at: isoStamp(r.created_at),
    }));
  }
  const em = assertEm(db);
  const conn = em.getConnection();
  const conditions = ["org_id = ?"];
  const params: (string | null)[] = [orgId];

  if (!filter?.includeArchived) {
    conditions.push("(archived = false OR archived IS NULL)");
  }
  if (filter?.projectId) {
    params.push(filter.projectId);
    conditions.push(`project_id = ?`);
  }
  if (filter?.runId) {
    params.push(filter.runId);
    conditions.push(`run_id = ?`);
  }
  if (filter?.taskId) {
    params.push(filter.taskId);
    conditions.push(`task_id = ?`);
  }
  if (filter?.mime) {
    params.push(filter.mime);
    conditions.push(`mime = ?`);
  }
  if (filter?.kind) {
    params.push(filter.kind);
    conditions.push(`kind = ?`);
  }

  const where = conditions.join(" AND ");
  const rows = await conn.execute(
    `SELECT id, org_id, project_id, run_id, task_id, kind, title,
            body_path, sha256, size, mime, COALESCE(archived, false) AS archived, created_at
       FROM artifacts
      WHERE ${where}
      ORDER BY created_at DESC, id ASC`,
    params,
  ) as Array<ArtifactRow & { created_at: string | Date }>;

  return rows.map((r) => ({
    ...r,
    archived: Boolean(r.archived),
    created_at: isoStamp(r.created_at),
  }));
}

export interface ArtifactDetail extends ArtifactRow {
  downloadHref: string;
  retentionDaysRemaining: number;
  content: string | null;
}

/** Read a single artifact with computed detail fields for the detail page. */
export async function readArtifactDetail(
  db: DbHandle,
  input: { orgId: string; id: string },
): Promise<ArtifactDetail | null> {
  if (isSqlExecutor(db)) {
    const rows = await db.query<ArtifactRow & { created_at: string | Date }>(
      `SELECT id, org_id, project_id, run_id, task_id, kind, title,
              body_path, sha256, size, mime, COALESCE(archived, false) AS archived, created_at
         FROM artifacts
        WHERE id = $1 AND org_id = $2`,
      [input.id, input.orgId],
    );
    const row = rows[0];
    if (!row) return null;
    return artifactDetailFromRow(row);
  }
  const em = assertEm(db);
  const conn = em.getConnection();
  const rows = await conn.execute(
    `SELECT id, org_id, project_id, run_id, task_id, kind, title,
            body_path, sha256, size, mime, COALESCE(archived, false) AS archived, created_at
       FROM artifacts
      WHERE id = ? AND org_id = ?`,
    [input.id, input.orgId],
  ) as Array<ArtifactRow & { created_at: string | Date }>;
  const row = rows[0];
  if (!row) return null;

  return artifactDetailFromRow(row);
}

async function artifactDetailFromRow(row: ArtifactRow & { created_at: string | Date }): Promise<ArtifactDetail> {
  const rawCreatedAt = row.created_at as string | Date;
  const createdAt = rawCreatedAt instanceof Date ? rawCreatedAt : new Date(rawCreatedAt);
  const retentionDays = 90;
  const elapsed = Math.floor((Date.now() - createdAt.getTime()) / 86_400_000);
  const remaining = Math.max(0, retentionDays - elapsed);

  let content: string | null = null;
  if (row.body_path && row.mime?.startsWith("text/")) {
    try {
      const { readFile } = await import("node:fs/promises");
      content = await readFile(row.body_path, "utf-8");
    } catch {
      content = null;
    }
  }

  return {
    ...row,
    archived: Boolean(row.archived),
    created_at: isoStamp(row.created_at),
    downloadHref: `/artifacts/${row.id}/download`,
    retentionDaysRemaining: remaining,
    content,
  };
}

/** Delete an artifact row (soft: archive; hard: remove row). */
export async function deleteArtifactAction(
  db: DbHandle,
  id: string,
  orgId: string,
): Promise<void> {
  const em = assertEm(db);
  const conn = em.getConnection();
  await conn.execute(
    `DELETE FROM artifacts WHERE id = ? AND org_id = ?`,
    [id, orgId],
  );
}

export async function getArtifactStats(
  db: DbHandle,
  orgId: string,
  projectId: string,
): Promise<ArtifactStats> {
  const em = assertEm(db);
  const conn = em.getConnection();
  const rows = await conn.execute(
    `SELECT COALESCE(SUM(size), 0) AS total_bytes, COUNT(*)::int AS count
       FROM artifacts
      WHERE org_id = ? AND project_id = ?`,
    [orgId, projectId],
  ) as Array<{ total_bytes: string | number | null; count: string | number }>;
  const row = rows[0]!;
  return {
    totalBytes: Number(row.total_bytes ?? 0),
    count: Number(row.count),
  };
}
