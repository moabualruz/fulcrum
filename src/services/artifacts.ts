/**
 * Artifact service — pure DB operations for artifact CRUD.
 * Canonical home; web layer re-exports from here.
 * Dependency direction: services -> product-kernel (never web).
 */
import type { DbHandle } from "../product-kernel/store/repositories.ts";

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

/** Resolve EntityManager from DbHandle (mirrors repositories.ts pattern). */
function assertEm(db: DbHandle) {
  if ("persist" in db && typeof (db as { persist: unknown }).persist === "function") {
    return db as import("@mikro-orm/postgresql").EntityManager;
  }
  throw new Error("artifacts.ts: EntityManager required — pass em instead of raw ProductDb.");
}

export async function listArtifacts(
  db: DbHandle,
  orgId: string,
  filter?: ArtifactFilter & { includeArchived?: boolean },
): Promise<ArtifactRow[]> {
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
