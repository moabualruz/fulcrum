import { injectable as Injectable } from "@needle-di/core";

import type { SqlExecutor } from "../../db/sql.ts";
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
  status?: string | null;
  updated_at?: string | Date | null;
  frontmatter?: Record<string, unknown>;
}

export function stripDocumentMarkdown(markdown: string): string {
  return markdown
    .replace(/^---[\s\S]*?---\s*/u, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/gu, (_match, target: string, alias?: string) => alias ?? target)
    .replace(/^#{1,6}\s+/gmu, "")
    .replace(/[*_~`>]+/gu, "")
    .replace(/^\s*[-+]\s+/gmu, "")
    .replace(/^\s*\d+\.\s+/gmu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 10_000);
}

@Injectable()
export class DocumentIndexer extends SearchIndexHook {
  override readonly kind = "doc";

  constructor(db: SqlExecutor) {
    super(db);
  }

  protected override async buildDocument(entityId: string, orgId: string): Promise<SearchDocumentInput> {
    const columns = await tableColumns(this.db, "documents");
    const optionalSelects = [
      columns.has("body_md") ? "body_md" : "NULL::text AS body_md",
      columns.has("content_json") ? "content_json" : "'{}'::jsonb AS content_json",
      columns.has("doc_type") ? "doc_type" : "kind AS doc_type",
      columns.has("scope") ? "scope" : "'project'::text AS scope",
      columns.has("status") ? "status" : "NULL::text AS status",
      columns.has("updated_at") ? "updated_at" : "NULL::timestamptz AS updated_at",
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
      body: stripDocumentMarkdown(doc.body_md || doc.body || textFromUnknown(doc.content_json)),
      labels: tagsFromUnknown(doc.frontmatter?.["tags"]),
      metadata: {
        doc_type: doc.doc_type ?? doc.kind ?? null,
        scope: doc.scope ?? "project",
      },
      status: doc.status ?? null,
      updatedAt: doc.updated_at ? new Date(doc.updated_at) : undefined,
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
