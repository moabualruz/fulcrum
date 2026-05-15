import type { ProductDb } from "./db/types.ts";
import { newUlid } from "./ids.ts";

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
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface CreateArtifactInput {
  orgId: string;
  projectId?: string | null;
  runId?: string | null;
  taskId?: string | null;
  kind: string;
  title: string;
  bodyPath?: string | null;
  sha256?: string | null;
  size?: number | null;
  mime?: string | null;
  metadataJson?: Record<string, unknown>;
}

export async function createArtifact(
  db: ProductDb,
  input: CreateArtifactInput,
): Promise<ArtifactRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO artifacts (id, org_id, project_id, run_id, task_id, kind, title, body_path, sha256, size, mime, metadata_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.runId ?? null,
      input.taskId ?? null,
      input.kind,
      input.title,
      input.bodyPath ?? null,
      input.sha256 ?? null,
      input.size ?? null,
      input.mime ?? null,
      JSON.stringify(input.metadataJson ?? {}),
    ],
  );
  return (await getArtifact(db, id)) as ArtifactRow;
}

/** Get single artifact — includes metadata_json.narration when present. */
export async function getArtifact(
  db: ProductDb,
  id: string,
): Promise<ArtifactRow | null> {
  const rows = await db.query<ArtifactRow>(
    `SELECT * FROM artifacts WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  // PGlite returns jsonb as string; parse if needed.
  if (typeof row.metadata_json === "string") {
    row.metadata_json = JSON.parse(row.metadata_json);
  }
  return row;
}

/** List artifacts — omits narration from metadata_json for performance. */
export async function listArtifacts(
  db: ProductDb,
  orgId: string,
  projectId?: string | null,
): Promise<Omit<ArtifactRow, "metadata_json">[]> {
  const rows = await db.query<ArtifactRow>(
    projectId
      ? `SELECT id, org_id, project_id, run_id, task_id, kind, title, body_path, sha256, size, mime, created_at
         FROM artifacts WHERE org_id = $1 AND project_id = $2
         ORDER BY created_at DESC, id DESC`
      : `SELECT id, org_id, project_id, run_id, task_id, kind, title, body_path, sha256, size, mime, created_at
         FROM artifacts WHERE org_id = $1
         ORDER BY created_at DESC, id DESC`,
    projectId ? [orgId, projectId] : [orgId],
  );
  return rows;
}

/** Update metadata_json, merging with existing value. */
export async function updateArtifactMetadata(
  db: ProductDb,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await db.query(
    `UPDATE artifacts SET metadata_json = metadata_json || $2::jsonb WHERE id = $1`,
    [id, JSON.stringify(patch)],
  );
}
