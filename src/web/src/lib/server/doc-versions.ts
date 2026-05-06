/**
 * Document versions — migrated from raw LegacyDatabaseHandle to MikroORM EntityManager.
 * ARCH-01/ARCH-02: All DB access via MikroORM EM connection.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { randomUUID } from "node:crypto";

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
  await em.getKysely<any>()
    .insertInto("doc_versions")
    .values({
      id,
      doc_id: input.docId,
      org_id: input.orgId,
      version_num: input.version,
      snapshot: { title: input.title, frontmatter: input.frontmatter, author: input.author },
      body_md_snapshot: input.body,
    })
    .execute();
  return { id, version: input.version };
}

export async function listDocumentVersions(
  em: EntityManager,
  docId: string,
): Promise<DocVersion[]> {
  const rows = await em.getKysely<any>()
    .selectFrom("doc_versions")
    .select(["id", "doc_id", "org_id", "version_num", "snapshot", "body_md_snapshot", "created_at"])
    .where("doc_id", "=", docId)
    .orderBy("version_num", "desc")
    .execute() as LegacyDocVersionRow[];
  return rows.map(legacyToDocVersion);
}

export async function getDocumentVersion(
  em: EntityManager,
  docId: string,
  version: number,
): Promise<DocVersion | null> {
  const rows = await em.getKysely<any>()
    .selectFrom("doc_versions")
    .select(["id", "doc_id", "org_id", "version_num", "snapshot", "body_md_snapshot", "created_at"])
    .where("doc_id", "=", docId)
    .where("version_num", "=", version)
    .execute() as LegacyDocVersionRow[];
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
  await em.getKysely<any>()
    .updateTable("documents")
    .set({ title: ver.title, body_md: ver.body, frontmatter: ver.frontmatter, updated_at: new Date() })
    .where("id", "=", docId)
    .where("org_id", "=", orgId)
    .execute();
}

/** Get the next version number for a document. */
export async function getNextVersionNumber(em: EntityManager, docId: string): Promise<number> {
  const rows = await em.getKysely<any>()
    .selectFrom("doc_versions")
    .select(["version_num"])
    .where("doc_id", "=", docId)
    .execute() as Array<{ version_num: number | null }>;
  return Math.max(0, ...rows.map((row) => Number(row.version_num ?? 0))) + 1;
}
