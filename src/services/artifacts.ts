/**
 * Artifact service — pure DB operations for artifact CRUD.
 * Canonical home; web layer re-exports from here.
 * Dependency direction: services -> product-kernel (never web).
 */
import type { ProductDb } from "../product-kernel/db/types.ts";

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

export async function listArtifacts(
  db: ProductDb,
  orgId: string,
  filter?: ArtifactFilter & { includeArchived?: boolean },
): Promise<ArtifactRow[]> {
  const conditions = ["org_id = $1"];
  const params: (string | null)[] = [orgId];

  if (!filter?.includeArchived) {
    conditions.push("(archived = false OR archived IS NULL)");
  }
  if (filter?.projectId) {
    params.push(filter.projectId);
    conditions.push(`project_id = $${params.length}`);
  }
  if (filter?.runId) {
    params.push(filter.runId);
    conditions.push(`run_id = $${params.length}`);
  }
  if (filter?.taskId) {
    params.push(filter.taskId);
    conditions.push(`task_id = $${params.length}`);
  }
  if (filter?.mime) {
    params.push(filter.mime);
    conditions.push(`mime = $${params.length}`);
  }
  if (filter?.kind) {
    params.push(filter.kind);
    conditions.push(`kind = $${params.length}`);
  }

  const where = conditions.join(" AND ");
  const rows = await db.query<ArtifactRow & { created_at: string | Date }>(
    `SELECT id, org_id, project_id, run_id, task_id, kind, title,
            body_path, sha256, size, mime, COALESCE(archived, false) AS archived, created_at
       FROM artifacts
      WHERE ${where}
      ORDER BY created_at DESC, id ASC`,
    params,
  );

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
  db: ProductDb,
  input: { orgId: string; id: string },
): Promise<ArtifactDetail | null> {
  const rows = await db.query<ArtifactRow & { created_at: string | Date }>(
    `SELECT id, org_id, project_id, run_id, task_id, kind, title,
            body_path, sha256, size, mime, COALESCE(archived, false) AS archived, created_at
       FROM artifacts
      WHERE id = $1 AND org_id = $2`,
    [input.id, input.orgId],
  );
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
  db: ProductDb,
  id: string,
  orgId: string,
): Promise<void> {
  await db.query(
    `DELETE FROM artifacts WHERE id = $1 AND org_id = $2`,
    [id, orgId],
  );
}

export async function getArtifactStats(
  db: ProductDb,
  orgId: string,
  projectId: string,
): Promise<ArtifactStats> {
  const rows = await db.query<{ total_bytes: string | number | null; count: string | number }>(
    `SELECT COALESCE(SUM(size), 0) AS total_bytes, COUNT(*)::int AS count
       FROM artifacts
      WHERE org_id = $1 AND project_id = $2`,
    [orgId, projectId],
  );
  const row = rows[0]!;
  return {
    totalBytes: Number(row.total_bytes ?? 0),
    count: Number(row.count),
  };
}
