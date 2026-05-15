import type { EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";

export interface UpsertDocLinkInput {
  orgId: string;
  sourceDocId: string;
  targetDocId: string;
  linkType: string;
}

export interface Backlink {
  source_doc_id: string;
  title: string;
  link_type: string;
}

interface BacklinkRow {
  source_doc_id: string | null;
  title: string;
  link_type: string | null;
}

interface DocLinkColumns {
  sourceDocId: "from_doc_id" | "source_doc_id";
  targetDocId: "to_doc_id" | "target_doc_id";
  linkType: "link_kind" | "link_type";
  targetSlug: "to_slug" | null;
}

export async function upsertDocLink(em: EntityManager, input: UpsertDocLinkInput): Promise<void> {
  const columns = await resolveDocLinkColumns(em);
  const existing = await em.getConnection().execute<Array<{ id: string }>>(
    `select "id" from "doc_links" where "org_id" = ? and "${columns.sourceDocId}" = ? and "${columns.targetDocId}" = ? and "${columns.linkType}" = ? limit 1`,
    [input.orgId, input.sourceDocId, input.targetDocId, input.linkType],
  );
  if (existing.length > 0) return;

  const columnNames = ["id", "org_id", columns.sourceDocId, columns.targetDocId, columns.linkType];
  const values = [randomUUID(), input.orgId, input.sourceDocId, input.targetDocId, input.linkType];
  if (columns.targetSlug) {
    columnNames.push(columns.targetSlug);
    values.push(input.targetDocId);
  }

  await em.getConnection().execute(
    `insert into "doc_links" (${columnNames.map((column) => `"${column}"`).join(", ")}) values (${values.map(() => "?").join(", ")})`,
    values,
  );
}

/** Get all documents linking TO a given document (backlinks). */
export async function getBacklinks(em: EntityManager, targetDocId: string): Promise<Backlink[]> {
  const columns = await resolveDocLinkColumns(em);
  const rows = await em.getConnection().execute<BacklinkRow[]>(
    `select dl."${columns.sourceDocId}" as "source_doc_id", d."title" as "title", dl."${columns.linkType}" as "link_type" from "doc_links" as dl inner join "documents" as d on d."id" = dl."${columns.sourceDocId}" where dl."${columns.targetDocId}" = ? order by d."title" asc`,
    [targetDocId],
  );
  return rows.map((row) => ({
    source_doc_id: row.source_doc_id ?? "",
    title: row.title,
    link_type: row.link_type ?? "wikilink",
  }));
}

async function resolveDocLinkColumns(em: EntityManager): Promise<DocLinkColumns> {
  const rows = await em.getConnection().execute<Array<{ column_name: string }>>(
    "select column_name from information_schema.columns where table_name = 'doc_links'",
  );
  const names = new Set(rows.map((row) => row.column_name));

  return {
    sourceDocId: names.has("from_doc_id") ? "from_doc_id" : "source_doc_id",
    targetDocId: names.has("to_doc_id") ? "to_doc_id" : "target_doc_id",
    linkType: names.has("link_kind") ? "link_kind" : "link_type",
    targetSlug: names.has("to_slug") ? "to_slug" : null,
  };
}
