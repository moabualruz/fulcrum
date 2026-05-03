import { injectable as Injectable } from "@needle-di/core";

import type { ProductDb } from "../../product-kernel/db/types.ts";
import { SearchIndexHook, type SearchDocumentInput } from "./base.ts";
import { tableColumns, textFromUnknown } from "./entity-helpers.ts";

interface ArtifactRow {
  id: string;
  org_id: string;
  project_id: string | null;
  title: string;
  filename?: string | null;
  mime: string | null;
  metadata_json?: unknown;
}

@Injectable()
export class ArtifactIndexer extends SearchIndexHook {
  override readonly kind = "artifact";

  constructor(db: ProductDb) {
    super(db);
  }

  protected override async buildDocument(entityId: string, orgId: string): Promise<SearchDocumentInput> {
    const columns = await tableColumns(this.db, "artifacts");
    const optionalSelects = [
      columns.has("filename") ? "filename" : "NULL::text AS filename",
      columns.has("metadata_json") ? "metadata_json" : "'{}'::jsonb AS metadata_json",
      columns.has("mime") ? "mime" : "NULL::text AS mime",
    ];
    const rows = await this.db.query<ArtifactRow>(
      `SELECT id, org_id, project_id, title, ${optionalSelects.join(", ")}
         FROM artifacts
        WHERE id = $1 AND org_id = $2`,
      [entityId, orgId],
    );
    const artifact = rows[0];
    if (!artifact) throw new Error(`Artifact not found for search indexing: ${entityId}`);

    return {
      orgId: artifact.org_id,
      projectId: artifact.project_id,
      sourceKind: this.kind,
      sourceId: artifact.id,
      title: artifact.filename || artifact.title,
      body: textFromUnknown(artifact.metadata_json),
      labels: [],
      metadata: {
        mime: artifact.mime ?? null,
        project_id: artifact.project_id,
      },
    };
  }

  async listEntityIds(orgId: string): Promise<string[]> {
    const rows = await this.db.query<{ id: string }>(
      `SELECT id FROM artifacts WHERE org_id = $1 ORDER BY id`,
      [orgId],
    );
    return rows.map((row) => row.id);
  }
}
