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
  size_bytes?: bigint | number | string | null;
  checksum_sha256?: string | null;
  retention_until?: Date | string | null;
  created_at?: Date | string | null;
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
      columns.has("size_bytes") ? "size_bytes" : "NULL::bigint AS size_bytes",
      columns.has("checksum_sha256") ? "checksum_sha256" : "NULL::text AS checksum_sha256",
      columns.has("retention_until") ? "retention_until" : "NULL::timestamptz AS retention_until",
      columns.has("created_at") ? "created_at" : "NULL::timestamptz AS created_at",
    ];
    const rows = await this.db.query<ArtifactRow>(
      `SELECT id, org_id, project_id, title, ${optionalSelects.join(", ")}
         FROM artifacts
        WHERE id = $1 AND org_id = $2`,
      [entityId, orgId],
    );
    const artifact = rows[0];
    if (!artifact) throw new Error(`Artifact not found for search indexing: ${entityId}`);

    return buildArtifactSearchDocument(artifact);
  }

  async listEntityIds(orgId: string): Promise<string[]> {
    const rows = await this.db.query<{ id: string }>(
      `SELECT id FROM artifacts WHERE org_id = $1 ORDER BY id`,
      [orgId],
    );
    return rows.map((row) => row.id);
  }
}

export function buildArtifactSearchDocument(artifact: ArtifactRow): SearchDocumentInput {
  const metadata = normalizeMetadata(artifact.metadata_json);
  const title = artifact.filename || artifact.title;
  const queryText = [
    title,
    artifact.mime,
    metadata["sourcePath"],
    metadata["sourceGlob"],
    metadata["producerKind"],
    metadata["producerId"],
    metadata["runId"],
    metadata["previewKind"],
    textFromUnknown(metadata),
  ].filter((value) => typeof value === "string" && value.length > 0).join("\n");

  return {
    orgId: artifact.org_id,
    projectId: artifact.project_id,
    sourceKind: "artifact",
    sourceId: artifact.id,
    title,
    body: queryText,
    labels: artifact.mime ? [artifact.mime] : [],
    metadata: {
      ...metadata,
      mime: artifact.mime ?? null,
      project_id: artifact.project_id,
      projectId: artifact.project_id,
      sha256: metadata["sha256"] ?? artifact.checksum_sha256 ?? null,
      digest: metadata["sha256"] ?? artifact.checksum_sha256 ?? null,
      sizeBytes: stringifySize(artifact.size_bytes),
      retentionUntil: isoOrNull(artifact.retention_until),
      createdAt: isoOrNull(artifact.created_at),
    },
  };
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringifySize(value: ArtifactRow["size_bytes"]): string | null {
  if (value == null) return null;
  return String(value);
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}
