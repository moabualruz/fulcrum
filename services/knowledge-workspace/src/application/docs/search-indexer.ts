import { randomUUID } from "node:crypto";

import type { EntityManager } from "typeorm";

import { stripDocumentMarkdown } from "@knowledge-workspace/application/search/indexers/document.ts";

export interface DocRow {
  id: string;
  org: { id: string };
  projectId: string | null;
  scope: string;
  docType: string;
  frontmatter: Record<string, unknown>;
  bodyMd: string;
  archived: boolean;
}

async function tableColumns(em: EntityManager, tableName: string): Promise<Set<string>> {
  const rows = await em.getConnection().execute<Array<{ column_name: string }>>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = ?`,
    [tableName],
  );
  return new Set(rows.map((row) => row.column_name));
}

function tagsFromFrontmatter(frontmatter: Record<string, unknown>): string[] {
  const tags = frontmatter.tags;
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag): tag is string => typeof tag === "string" && tag.length > 0);
}

function titleFromDoc(doc: DocRow): string {
  const title = doc.frontmatter.title;
  return typeof title === "string" && title.length > 0 ? title : doc.id;
}

function postgresTextArray(values: readonly string[]): string {
  return `{${values.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

export async function indexDoc(
  em: EntityManager,
  doc: DocRow,
  authorId: string | null = null,
): Promise<void> {
  const columns = await tableColumns(em, "search_documents");
  if (!columns.has("source_kind") || !columns.has("title") || !columns.has("body")) {
    await em.getConnection().execute(
      `DELETE FROM search_documents
        WHERE org_id = ? AND entity_kind = 'doc' AND entity_id = ?`,
      [doc.org.id, doc.id],
    );
    await em.getConnection().execute(
      `INSERT INTO search_documents (id, org_id, entity_kind, entity_id)
       VALUES (?, ?, 'doc', ?)`,
      [randomUUID(), doc.org.id, doc.id],
    );
    return;
  }

  await em.getConnection().execute(
    `INSERT INTO search_documents
       (id, org_id, project_id, entity_kind, entity_id, source_kind, source_id, title, body, labels, metadata, archived)
     VALUES (?, ?, ?, 'doc', ?, 'doc', ?, ?, ?, ?::text[], ?::jsonb, ?)
     ON CONFLICT (org_id, source_kind, source_id) DO UPDATE
        SET project_id = EXCLUDED.project_id,
            entity_kind = EXCLUDED.entity_kind,
            entity_id = EXCLUDED.entity_id,
            title = EXCLUDED.title,
            body = EXCLUDED.body,
            labels = EXCLUDED.labels,
            metadata = EXCLUDED.metadata,
            archived = EXCLUDED.archived,
            updated_at = now()`,
    [
      randomUUID(),
      doc.org.id,
      doc.projectId,
      doc.id,
      doc.id,
      titleFromDoc(doc),
      stripDocumentMarkdown(doc.bodyMd),
      postgresTextArray(tagsFromFrontmatter(doc.frontmatter)),
      JSON.stringify({ doc_type: doc.docType, scope: doc.scope, author_id: authorId }),
      doc.archived,
    ],
  );
}

export async function archiveDocIndex(em: EntityManager, orgId: string, docId: string): Promise<void> {
  const columns = await tableColumns(em, "search_documents");
  if (!columns.has("source_kind") || !columns.has("archived")) return;
  await em.getConnection().execute(
    `UPDATE search_documents
        SET archived = true,
            updated_at = now()
      WHERE org_id = ? AND source_kind = 'doc' AND source_id = ?`,
    [orgId, docId],
  );
}

export async function removeDocIndex(em: EntityManager, orgId: string, docId: string): Promise<void> {
  const columns = await tableColumns(em, "search_documents");
  const kindColumn = columns.has("source_kind") ? "source_kind" : "entity_kind";
  const idColumn = columns.has("source_id") ? "source_id" : "entity_id";
  await em.getConnection().execute(
    `DELETE FROM search_documents
      WHERE org_id = ? AND ${kindColumn} = 'doc' AND ${idColumn} = ?`,
    [orgId, docId],
  );
}
