import type { ProductDb } from "../../../../product-kernel/db/types.ts";
import { newUlid } from "../../../../product-kernel/ids.ts";

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
  return db.query<Backlink>(
    `SELECT dl.source_doc_id, d.title, dl.link_type
       FROM doc_links dl
       JOIN documents d ON d.id = dl.source_doc_id
      WHERE dl.target_doc_id = $1
      ORDER BY d.title ASC`,
    [targetDocId],
  );
}
