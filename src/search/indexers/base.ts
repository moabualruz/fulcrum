import { injectable as Injectable } from "@needle-di/core";

import { enqueueJob } from "../../product-kernel/jobs.ts";
import { newUlid } from "../../product-kernel/ids.ts";
import type { ProductDb } from "../../product-kernel/db/types.ts";
import {
  type EmbedText,
  embeddingText,
  isEmbeddingsEnabled,
  serializeEmbedding,
} from "../embeddings.ts";
import { upsertMeilisearchDocument } from "../backend.ts";
import { tableColumns } from "./entity-helpers.ts";

export type SearchIndexKind =
  | "doc"
  | "task"
  | "memory"
  | "run"
  | "artifact"
  | "repo"
  | "project"
  | "sprint";

export interface SearchDocumentInput {
  orgId: string;
  projectId?: string | null;
  sourceKind: SearchIndexKind | string;
  sourceId: string;
  title: string;
  body: string;
  labels?: readonly string[];
  metadata?: Record<string, unknown>;
  /** Expanded columns — populated by Phase 06 indexers */
  status?: string | null;
  updatedAt?: Date | null;
}

export interface IndexerHook {
  readonly kind: SearchIndexKind | string;
  upsert(entityId: string, orgId: string): Promise<void>;
  remove(entityId: string, orgId: string): Promise<void>;
  listEntityIds?(orgId: string): Promise<readonly string[]>;
}

export interface SearchIndexHookOptions {
  embedText?: EmbedText;
}

function toPostgresTextArray(values: readonly string[]): string {
  return `{${values.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

@Injectable()
export class SearchIndexHook implements IndexerHook {
  readonly kind: SearchIndexKind | string = "unknown";

  constructor(
    protected readonly db: ProductDb,
    private readonly options: SearchIndexHookOptions = {},
  ) {}

  protected buildDocument(_entityId: string, _orgId: string): Promise<SearchDocumentInput> {
    throw new Error("SearchIndexHook subclasses must implement buildDocument");
  }

  async upsert(entityId: string, orgId: string): Promise<void> {
    const document = await this.buildDocument(entityId, orgId);
    if (document.orgId !== orgId) {
      throw new Error("Search index document orgId must match upsert orgId");
    }
    if (document.sourceKind !== this.kind) {
      throw new Error("Search index document kind must match indexer kind");
    }
    if (document.sourceId !== entityId) {
      throw new Error("Search index document sourceId must match upsert entityId");
    }

    const embedding =
      isEmbeddingsEnabled() && this.options.embedText
        ? serializeEmbedding(await this.options.embedText(embeddingText(document.title, document.body)))
        : null;

    const columns = await tableColumns(this.db, "search_documents");
    if (columns.has("embedding")) {
      await this.db.query(
        `INSERT INTO search_documents
           (id, org_id, project_id, source_kind, source_id, title, body, labels, metadata, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9::jsonb, $10)
         ON CONFLICT (org_id, source_kind, source_id) DO UPDATE
            SET project_id = EXCLUDED.project_id,
                title = EXCLUDED.title,
                body = EXCLUDED.body,
                labels = EXCLUDED.labels,
                metadata = EXCLUDED.metadata,
                embedding = EXCLUDED.embedding,
                updated_at = now()`,
        [
          newUlid(),
          orgId,
          document.projectId ?? null,
          this.kind,
          entityId,
          document.title,
          document.body,
          toPostgresTextArray(document.labels ?? []),
          JSON.stringify(document.metadata ?? {}),
          embedding,
        ],
      );
      await upsertMeilisearchDocument(document);
      return;
    }

    await this.db.query(
      `INSERT INTO search_documents
         (id, org_id, project_id, source_kind, source_id, title, body, labels, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9::jsonb)
       ON CONFLICT (org_id, source_kind, source_id) DO UPDATE
          SET project_id = EXCLUDED.project_id,
              title = EXCLUDED.title,
              body = EXCLUDED.body,
              labels = EXCLUDED.labels,
              metadata = EXCLUDED.metadata,
              updated_at = now()`,
      [
        newUlid(),
        orgId,
        document.projectId ?? null,
        this.kind,
        entityId,
        document.title,
        document.body,
        toPostgresTextArray(document.labels ?? []),
        JSON.stringify(document.metadata ?? {}),
      ],
    );
    await upsertMeilisearchDocument(document);
  }

  async remove(entityId: string, orgId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM search_documents
        WHERE org_id = $1 AND source_kind = $2 AND source_id = $3`,
      [orgId, this.kind, entityId],
    );
  }
}

@Injectable()
export class IndexerRegistry {
  private readonly indexers = new Map<string, IndexerHook>();

  register(indexer: IndexerHook): void {
    this.indexers.set(indexer.kind, indexer);
  }

  unregister(kind: SearchIndexKind | string): void {
    this.indexers.delete(kind);
  }

  get(kind: SearchIndexKind | string): IndexerHook | undefined {
    return this.indexers.get(kind);
  }

  async triggerUpsert(kind: SearchIndexKind | string, entityId: string, orgId: string): Promise<void> {
    await this.require(kind).upsert(entityId, orgId);
  }

  async triggerRemove(kind: SearchIndexKind | string, entityId: string, orgId: string): Promise<void> {
    await this.require(kind).remove(entityId, orgId);
  }

  async bulkReindex(
    db: ProductDb,
    orgId: string,
    kind: SearchIndexKind | string,
  ): Promise<{ queued: number }> {
    const indexer = this.require(kind);
    if (!indexer.listEntityIds) {
      throw new Error(`Search indexer does not support bulk reindex for kind: ${kind}`);
    }

    const entityIds = await indexer.listEntityIds(orgId);
    for (const entityId of entityIds) {
      await enqueueJob(db, {
        orgId,
        queue: "search",
        kind: "search.upsert",
        payload: { kind, entityId, orgId },
      });
    }
    return { queued: entityIds.length };
  }

  private require(kind: SearchIndexKind | string): IndexerHook {
    const indexer = this.indexers.get(kind);
    if (!indexer) {
      throw new Error(`No search indexer registered for kind: ${kind}`);
    }
    return indexer;
  }
}
