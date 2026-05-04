import type { ProductDb } from "@fulcrum/product-kernel/db/types.ts";
import { newUlid } from "@fulcrum/product-kernel/ids.ts";

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

export async function upsertDocLink(db: ProductDb, input: UpsertDocLinkInput): Promise<void> {
  const id = newUlid();
  await db.query(
    `INSERT INTO doc_links (id, org_id, source_doc_id, target_doc_id, link_type)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (source_doc_id, target_doc_id, link_type) DO NOTHING`,
    [id, input.orgId, input.sourceDocId, input.targetDocId, input.linkType],
  );
}

/** Get all documents linking TO a given document (backlinks). */
export async function getBacklinks(db: ProductDb, targetDocId: string): Promise<Backlink[]> {
  const rows = await db.query<BacklinkRow>(
    `SELECT dl.source_doc_id, dl.from_doc_id, d.title, dl.link_type, dl.link_kind
       FROM doc_links dl
       JOIN documents d ON d.id = COALESCE(dl.source_doc_id, dl.from_doc_id)
      WHERE COALESCE(dl.target_doc_id, dl.to_doc_id) = $1
      ORDER BY d.title ASC`,
    [targetDocId],
  );
  return rows.map((row) => ({
    source_doc_id: row.source_doc_id ?? row.from_doc_id ?? "",
    title: row.title,
    link_type: row.link_type ?? row.link_kind ?? "wikilink",
  }));
}
