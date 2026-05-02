import { injectable as Injectable } from "@needle-di/core";

import type { ProductDb } from "../../product-kernel/db/types.ts";
import { SearchIndexHook, type SearchDocumentInput } from "./base.ts";
import { tableColumns, tagsFromUnknown, textFromUnknown } from "./entity-helpers.ts";

interface DocumentRow {
  id: string;
  org_id: string;
  project_id: string | null;
  title: string;
  body: string | null;
  body_md?: string | null;
  content_json?: unknown;
  doc_type?: string | null;
  kind?: string | null;
  scope?: string | null;
  frontmatter?: Record<string, unknown>;
}

@Injectable()
export class DocumentIndexer extends SearchIndexHook {
  override readonly kind = "doc";

  constructor(db: ProductDb) {
    super(db);
  }

  protected override async buildDocument(entityId: string, orgId: string): Promise<SearchDocumentInput> {
    const columns = await tableColumns(this.db, "documents");
    const optionalSelects = [
      columns.has("body_md") ? "body_md" : "NULL::text AS body_md",
      columns.has("content_json") ? "content_json" : "'{}'::jsonb AS content_json",
      columns.has("doc_type") ? "doc_type" : "kind AS doc_type",
      columns.has("scope") ? "scope" : "'project'::text AS scope",
    ];
    const rows = await this.db.query<DocumentRow>(
      `SELECT id, org_id, project_id, title, body, frontmatter, kind, ${optionalSelects.join(", ")}
         FROM documents
        WHERE id = $1 AND org_id = $2`,
      [entityId, orgId],
    );
    const doc = rows[0];
    if (!doc) throw new Error(`Document not found for search indexing: ${entityId}`);

    return {
      orgId: doc.org_id,
      projectId: doc.project_id,
      sourceKind: this.kind,
      sourceId: doc.id,
      title: doc.title,
      body: doc.body_md || doc.body || textFromUnknown(doc.content_json),
      labels: tagsFromUnknown(doc.frontmatter?.["tags"]),
      metadata: {
        doc_type: doc.doc_type ?? doc.kind ?? null,
        scope: doc.scope ?? "project",
      },
    };
  }

  async listEntityIds(orgId: string): Promise<string[]> {
    const rows = await this.db.query<{ id: string }>(
      `SELECT id FROM documents WHERE org_id = $1 ORDER BY id`,
      [orgId],
    );
    return rows.map((row) => row.id);
  }
}
