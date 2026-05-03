import type { ProductDb } from "../../../../product-kernel/db/types.ts";

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
  filter?: ArtifactFilter,
): Promise<ArtifactRow[]> {
  const conditions = ["org_id = $1"];
  const params: (string | null)[] = [orgId];

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
            body_path, sha256, size, mime, created_at
       FROM artifacts
      WHERE ${where}
      ORDER BY created_at DESC, id ASC`,
    params,
  );

  return rows.map((r) => ({
    ...r,
    created_at: isoStamp(r.created_at),
  }));
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
