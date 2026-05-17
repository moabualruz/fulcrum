/**
 * Document versions — migrated from raw LegacyDatabaseHandle to TypeORM EntityManager.
 * ARCH-01/ARCH-02: All DB access via TypeORM connection.
 */

import type { EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";
import { ormSqlConnection } from "@platform-core/application/orm-helpers.ts";

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

type LegacyDocVersionRow = {
  id: string;
  doc_id: string;
  org_id: string;
  version_num: number;
  body_md_snapshot: string | null;
  snapshot: Record<string, unknown> | null;
  created_at: Date | string;
};

async function tableColumns(em: EntityManager, tableName: string): Promise<Set<string>> {
  const rows = await ormSqlConnection(em).execute<Array<{ column_name: string }>>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1`,
    [tableName],
  );
  return new Set(rows.map((row) => row.column_name));
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
  const snapshot = row.snapshot ?? {};
  const frontmatter = typeof snapshot["frontmatter"] === "object" && snapshot["frontmatter"] !== null
    ? snapshot["frontmatter"] as Record<string, unknown>
    : {};
  return {
    id: row.id,
    doc_id: row.doc_id,
    org_id: row.org_id,
    version: row.version_num,
    title: String(snapshot["title"] ?? `Version ${row.version_num}`),
    body,
    frontmatter,
    author: String(snapshot["author"] ?? "system"),
    created_at: normalizeTimestamp(row.created_at),
  };
}

export async function createDocumentVersion(
  em: EntityManager,
  input: CreateVersionInput,
): Promise<{ id: string; version: number }> {
  const id = randomUUID();
  await ormSqlConnection(em).execute(
    `INSERT INTO doc_versions (id, doc_id, org_id, version_num, snapshot, body_md_snapshot)
     VALUES ($1, $2, $3, $4, CAST($5 AS jsonb), $6)`,
    [
      id,
      input.docId,
      input.orgId,
      input.version,
      JSON.stringify({ title: input.title, frontmatter: input.frontmatter, author: input.author }),
      input.body,
    ],
  );
  return { id, version: input.version };
}

export async function listDocumentVersions(
  em: EntityManager,
  docId: string,
): Promise<DocVersion[]> {
  const rows = await ormSqlConnection(em).execute<LegacyDocVersionRow[]>(
    `SELECT id, doc_id, org_id, version_num, snapshot, body_md_snapshot, created_at
       FROM doc_versions
      WHERE doc_id = $1
      ORDER BY version_num DESC`,
    [docId],
  );
  return rows.map(legacyToDocVersion);
}

export async function getDocumentVersion(
  em: EntityManager,
  docId: string,
  version: number,
): Promise<DocVersion | null> {
  const rows = await ormSqlConnection(em).execute<LegacyDocVersionRow[]>(
    `SELECT id, doc_id, org_id, version_num, snapshot, body_md_snapshot, created_at
       FROM doc_versions
      WHERE doc_id = $1
        AND version_num = $2`,
    [docId, version],
  );
  return rows[0] ? legacyToDocVersion(rows[0]) : null;
}

/** Restore a document's content from a specific version. */
export async function restoreDocumentVersion(
  em: EntityManager,
  docId: string,
  orgId: string,
  version: number,
): Promise<void> {
  const ver = await getDocumentVersion(em, docId, version);
  if (!ver) throw new Error(`Version ${version} not found for doc ${docId}`);
  const columns = await tableColumns(em, "documents");
  const assignments = [
    "title = $1",
    "frontmatter = CAST($2 AS jsonb)",
    "updated_at = $3",
  ];
  const params: unknown[] = [ver.title, JSON.stringify(ver.frontmatter), new Date()];
  if (columns.has("body")) {
    params.push(ver.body);
    assignments.push(`body = $${params.length}`);
  }
  if (columns.has("body_md")) {
    params.push(ver.body);
    assignments.push(`body_md = $${params.length}`);
  }
  params.push(docId);
  const docIdParam = params.length;
  params.push(orgId);
  const orgIdParam = params.length;
  await ormSqlConnection(em).execute(
    `UPDATE documents
        SET ${assignments.join(", ")}
      WHERE id = $${docIdParam}
        AND org_id = $${orgIdParam}`,
    params,
  );
}

/** Get the next version number for a document. */
export async function getNextVersionNumber(em: EntityManager, docId: string): Promise<number> {
  const rows = await ormSqlConnection(em).execute<Array<{ version_num: number | null }>>(
    `SELECT version_num
       FROM doc_versions
      WHERE doc_id = $1`,
    [docId],
  );
  return Math.max(0, ...rows.map((row) => Number(row.version_num ?? 0))) + 1;
}
