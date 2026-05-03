import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import { newUlid } from "../../../../product-kernel/ids.ts";

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

export async function createDocumentVersion(
  db: ProductDb,
  input: CreateVersionInput,
): Promise<{ id: string; version: number }> {
  const id = newUlid();
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
  const rows = await db.query<DocVersion & { created_at: Date | string }>(
    `SELECT id, doc_id, org_id, version, title, body, frontmatter, author, created_at
       FROM document_versions WHERE doc_id = $1 ORDER BY version DESC`,
    [docId],
  );
  return rows.map((r) => ({
    ...r,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  }));
}

export async function getDocumentVersion(
  db: ProductDb,
  docId: string,
  version: number,
): Promise<DocVersion | null> {
  const rows = await db.query<DocVersion & { created_at: Date | string }>(
    `SELECT id, doc_id, org_id, version, title, body, frontmatter, author, created_at
       FROM document_versions WHERE doc_id = $1 AND version = $2`,
    [docId, version],
  );
  if (rows.length === 0) return null;
  const r = rows[0]!;
  return { ...r, created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at };
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
  const rows = await db.query<{ max_ver: number | null }>(
    `SELECT MAX(version) AS max_ver FROM document_versions WHERE doc_id = $1`,
    [docId],
  );
  return (rows[0]?.max_ver ?? 0) + 1;
}
