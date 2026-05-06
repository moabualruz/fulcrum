import type { EntityManager } from "@mikro-orm/postgresql";
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
  from_doc_id: string | null;
  title: string;
  link_type: string | null;
  link_kind: string | null;
}

export async function upsertDocLink(em: EntityManager, input: UpsertDocLinkInput): Promise<void> {
  const id = randomUUID();
  const db = em.getKysely<any>();
  const existing = await db.selectFrom("doc_links")
    .select(["id"])
    .where("org_id", "=", input.orgId)
    .where("from_doc_id", "=", input.sourceDocId)
    .where("to_doc_id", "=", input.targetDocId)
    .where("link_kind", "=", input.linkType)
    .executeTakeFirst();
  if (existing) return;
  await db.insertInto("doc_links")
    .values({
      id,
      org_id: input.orgId,
      from_doc_id: input.sourceDocId,
      to_doc_id: input.targetDocId,
      to_slug: input.targetDocId,
      link_kind: input.linkType,
    })
    .execute();
}

/** Get all documents linking TO a given document (backlinks). */
export async function getBacklinks(em: EntityManager, targetDocId: string): Promise<Backlink[]> {
  const rows = await em.getKysely<any>()
    .selectFrom("doc_links as dl")
    .innerJoin("documents as d", "d.id", "dl.from_doc_id")
    .select(["dl.from_doc_id", "d.title", "dl.link_kind"])
    .where("dl.to_doc_id", "=", targetDocId)
    .orderBy("d.title", "asc")
    .execute() as BacklinkRow[];
  return rows.map((row) => ({
    source_doc_id: row.source_doc_id ?? row.from_doc_id ?? "",
    title: row.title,
    link_type: row.link_type ?? row.link_kind ?? "wikilink",
  }));
}
