import type { ProductDb } from "@fulcrum/product-kernel/db/types.ts";
import { newUlid } from "@fulcrum/product-kernel/ids.ts";

export interface CreateVersionInput {
  docId: string;
  orgId: string;
  version: number;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
  author: string;
}

export interface DocVersion {
  id: string;
  doc_id: string;
  org_id: string;
  version: number;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
  author: string;
  created_at: string;
}

type DocVersionRow = Omit<DocVersion, "created_at"> & { created_at: Date | string };
type LegacyDocVersionRow = {
  id: string;
  doc_id: string;
  org_id: string;
  version_num: number;
  body_md_snapshot: string | null;
  snapshot: Record<string, unknown> | null;
  created_at: Date | string;
};

async function legacyVersionsTableExists(db: ProductDb): Promise<boolean> {
  const rows = await db.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables WHERE table_name = 'doc_versions'
     ) AS exists`,
  );
  return rows[0]?.exists ?? false;
}

function normalizeTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function legacyBody(row: LegacyDocVersionRow): string {
  if (row.body_md_snapshot !== null) return row.body_md_snapshot;
  const snapshot = row.snapshot;
  if (!snapshot) return "";
  return JSON.stringify(snapshot);
}

function legacyToDocVersion(row: LegacyDocVersionRow): DocVersion {
  const body = legacyBody(row);
  return {
    id: row.id,
    doc_id: row.doc_id,
    org_id: row.org_id,
    version: row.version_num,
    title: `Version ${row.version_num}`,
    body,
    frontmatter: {},
    author: "system",
    created_at: normalizeTimestamp(row.created_at),
  };
}

export async function createDocumentVersion(
  db: ProductDb,
  input: CreateVersionInput,
): Promise<{ id: string; version: number }> {
  const id = newUlid();
  if (await legacyVersionsTableExists(db)) {
    await db.query(
      `INSERT INTO doc_versions (id, doc_id, org_id, version_num, snapshot, body_md_snapshot)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [id, input.docId, input.orgId, input.version, JSON.stringify(input.frontmatter), input.body],
    );
    return { id, version: input.version };
  }
  await db.query(
    `INSERT INTO document_versions (id, doc_id, org_id, version, title, body, frontmatter, author)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [id, input.docId, input.orgId, input.version, input.title, input.body, JSON.stringify(input.frontmatter), input.author],
  );
  return { id, version: input.version };
}

export async function listDocumentVersions(
  db: ProductDb,
  docId: string,
): Promise<DocVersion[]> {
  const rows = await db.query<DocVersionRow>(
    `SELECT id, doc_id, org_id, version, title, body, frontmatter, author, created_at
       FROM document_versions WHERE doc_id = $1 ORDER BY version DESC`,
    [docId],
  );
  if (rows.length === 0 && await legacyVersionsTableExists(db)) {
    const legacyRows = await db.query<LegacyDocVersionRow>(
      `SELECT id, doc_id, org_id, version_num, snapshot, body_md_snapshot, created_at
         FROM doc_versions WHERE doc_id = $1 ORDER BY version_num DESC`,
      [docId],
    );
    return legacyRows.map(legacyToDocVersion);
  }
  return rows.map((r) => ({
    ...r,
    created_at: normalizeTimestamp(r.created_at),
  }));
}

export async function getDocumentVersion(
  db: ProductDb,
  docId: string,
  version: number,
): Promise<DocVersion | null> {
  const rows = await db.query<DocVersionRow>(
    `SELECT id, doc_id, org_id, version, title, body, frontmatter, author, created_at
       FROM document_versions WHERE doc_id = $1 AND version = $2`,
    [docId, version],
  );
  if (rows.length === 0) {
    if (await legacyVersionsTableExists(db)) {
      const legacyRows = await db.query<LegacyDocVersionRow>(
        `SELECT id, doc_id, org_id, version_num, snapshot, body_md_snapshot, created_at
           FROM doc_versions WHERE doc_id = $1 AND version_num = $2`,
        [docId, version],
      );
      return legacyRows[0] ? legacyToDocVersion(legacyRows[0]) : null;
    }
    return null;
  }
  const r = rows[0]!;
  return { ...r, created_at: normalizeTimestamp(r.created_at) };
}

/** Restore a document's content from a specific version. */
export async function restoreDocumentVersion(
  db: ProductDb,
  docId: string,
  orgId: string,
  version: number,
): Promise<void> {
  const ver = await getDocumentVersion(db, docId, version);
  if (!ver) throw new Error(`Version ${version} not found for doc ${docId}`);
  await db.query(
    `UPDATE documents SET title = $1, body = $2, frontmatter = $3::jsonb, updated_at = now()
       WHERE id = $4 AND org_id = $5`,
    [ver.title, ver.body, JSON.stringify(ver.frontmatter), docId, orgId],
  );
}

/** Get the next version number for a document. */
export async function getNextVersionNumber(db: ProductDb, docId: string): Promise<number> {
  if (await legacyVersionsTableExists(db)) {
    const rows = await db.query<{ max_ver: number | null }>(
      `SELECT MAX(version_num) AS max_ver FROM doc_versions WHERE doc_id = $1`,
      [docId],
    );
    return (rows[0]?.max_ver ?? 0) + 1;
  }
  const rows = await db.query<{ max_ver: number | null }>(
    `SELECT MAX(version) AS max_ver FROM document_versions WHERE doc_id = $1`,
    [docId],
  );
  return (rows[0]?.max_ver ?? 0) + 1;
}
