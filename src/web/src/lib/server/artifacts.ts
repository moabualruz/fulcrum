import { readFile, stat } from "node:fs/promises";
import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import { newUlid } from "../../../../product-kernel/ids.ts";
import { appendEvent } from "../../../../product-kernel/store/repositories.ts";

const RETENTION_DAYS = 30;

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
  created_at: string | Date;
}

export interface ArtifactListRow extends ArtifactRow {
  preview: string | null;
  thumbnail: boolean;
  downloadHref: string;
}

export interface ArtifactDetail extends ArtifactListRow {
  content: string | null;
  retentionDaysRemaining: number;
}

export async function createArtifactForRun(
  db: ProductDb,
  input: {
    orgId: string;
    projectId?: string | null;
    runId: string;
    kind: string;
    title: string;
    bodyPath?: string | null;
    mime?: string | null;
  },
): Promise<ArtifactRow> {
  const id = newUlid();
  let size: number | null = null;
  if (input.bodyPath) {
    try {
      size = (await stat(input.bodyPath)).size;
    } catch {
      size = null;
    }
  }
  await db.query(
    `INSERT INTO artifacts (id, org_id, project_id, run_id, kind, title, body_path, size, mime)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      input.orgId,
      input.projectId ?? null,
      input.runId,
      input.kind,
      input.title,
      input.bodyPath ?? null,
      size,
      input.mime ?? null,
    ],
  );
  await db.query(
    `INSERT INTO edges (id, org_id, project_id, from_kind, from_id, to_kind, to_id, rel)
     VALUES ($1, $2, $3, 'agent_run', $4, 'artifact', $5, 'produced')
     ON CONFLICT (from_kind, from_id, to_kind, to_id, rel) DO NOTHING`,
    [newUlid(), input.orgId, input.projectId ?? null, input.runId, id],
  );
  const rows = await db.query<ArtifactRow>(`SELECT * FROM artifacts WHERE id = $1`, [id]);
  return rows[0] as ArtifactRow;
}

export async function listArtifacts(
  db: ProductDb,
  filter: { orgId: string; projectId?: string | null; runId?: string | null; kind?: string | null },
): Promise<ArtifactListRow[]> {
  const clauses = ["org_id = $1"];
  const params: Array<string | number | boolean | null | Uint8Array> = [filter.orgId];
  if (filter.projectId !== undefined) {
    params.push(filter.projectId);
    clauses.push(`project_id IS NOT DISTINCT FROM $${params.length}`);
  }
  if (filter.runId) {
    params.push(filter.runId);
    clauses.push(`run_id = $${params.length}`);
  }
  if (filter.kind) {
    params.push(filter.kind);
    clauses.push(`kind = $${params.length}`);
  }
  const rows = await db.query<ArtifactRow>(
    `SELECT * FROM artifacts WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC, id ASC`,
    params,
  );
  return Promise.all(rows.map(hydrateListRow));
}

export async function listArtifactsForRun(
  db: ProductDb,
  input: { orgId: string; runId: string },
): Promise<ArtifactListRow[]> {
  const rows = await db.query<ArtifactRow>(
    `SELECT a.*
       FROM artifacts a
       JOIN edges e ON e.to_kind = 'artifact'
        AND e.to_id = a.id
        AND e.from_kind = 'agent_run'
        AND e.from_id = $1
        AND e.rel = 'produced'
      WHERE a.org_id = $2
      ORDER BY a.created_at DESC, a.id ASC`,
    [input.runId, input.orgId],
  );
  return Promise.all(rows.map(hydrateListRow));
}

export async function readArtifactDetail(
  db: ProductDb,
  input: { orgId: string; id: string },
): Promise<ArtifactDetail | null> {
  const rows = await db.query<ArtifactRow>(
    `SELECT * FROM artifacts WHERE id = $1 AND org_id = $2`,
    [input.id, input.orgId],
  );
  const row = rows[0];
  if (!row) return null;
  const listRow = await hydrateListRow(row);
  return {
    ...listRow,
    content: await readTextBody(row.body_path, 200_000),
    retentionDaysRemaining: retentionDays(row.created_at),
  };
}

export async function deleteArtifactAction(
  db: ProductDb,
  id: string,
  orgId: string,
): Promise<{ ok: boolean }> {
  const rows = await db.query<Pick<ArtifactRow, "id" | "org_id" | "project_id">>(
    `DELETE FROM artifacts WHERE id = $1 AND org_id = $2
     RETURNING id, org_id, project_id`,
    [id, orgId],
  );
  const row = rows[0];
  if (row) {
    await db.query(
      `DELETE FROM edges
       WHERE (to_kind = 'artifact' AND to_id = $1)
          OR (from_kind = 'artifact' AND from_id = $1)`,
      [id],
    );
    await appendEvent(db, {
      orgId: row.org_id,
      projectId: row.project_id,
      actor: "system",
      subjectKind: "artifact",
      subjectId: id,
      verb: "deleted",
    });
  }
  return { ok: true };
}

async function hydrateListRow(row: ArtifactRow): Promise<ArtifactListRow> {
  return {
    ...row,
    created_at: stamp(row.created_at),
    preview: await readTextBody(row.body_path, 200),
    thumbnail: (row.mime ?? "").startsWith("image/"),
    downloadHref: `/artifacts/${row.id}/download`,
  };
}

async function readTextBody(path: string | null, limit: number): Promise<string | null> {
  if (!path) return null;
  try {
    const text = await readFile(path, "utf8");
    return text.slice(0, limit);
  } catch {
    return null;
  }
}

function retentionDays(createdAt: string | Date): number {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const expires = created.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((expires - Date.now()) / (24 * 60 * 60 * 1000)));
}

function stamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
