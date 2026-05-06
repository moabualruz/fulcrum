import type { SqlExecutor } from "../db/sql.ts";
import type { SearchDocumentInput } from "./indexers/base.ts";
import {
  queryPgliteSearchDocuments,
  type SearchQueryInput,
  type SearchQueryOutput,
  type SearchResult,
} from "./query.ts";

const MEILISEARCH_FEATURE = "external-search-meilisearch";
const INDEX_NAME = "search_documents";

export interface SearchBackend {
  query(input: SearchQueryInput): Promise<SearchQueryOutput>;
}

export function isMeilisearchEnabled(): boolean {
  return (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((flag) => flag.trim())
    .filter(Boolean)
    .includes(MEILISEARCH_FEATURE);
}

export class PGliteBackend implements SearchBackend {
  constructor(private readonly db: SqlExecutor) {}

  query(input: SearchQueryInput): Promise<SearchQueryOutput> {
    return queryPgliteSearchDocuments(this.db, input);
  }
}

export class MeilisearchBackend implements SearchBackend {
  constructor(
    private readonly db: SqlExecutor,
    private readonly options: { url?: string; key?: string } = {},
  ) {}

  async query(input: SearchQueryInput): Promise<SearchQueryOutput> {
    const config = meilisearchConfig(this.options);
    if (!config) {
      return queryPgliteSearchDocuments(this.db, input);
    }

    try {
      const response = await fetch(`${config.url}/indexes/${INDEX_NAME}/search`, {
        method: "POST",
        headers: meilisearchHeaders(config.key),
        body: JSON.stringify(searchPayload(input)),
      });
      if (!response.ok) {
        throw new Error(`Meilisearch query failed: ${response.status}`);
      }
      const body = (await response.json()) as {
        hits?: unknown[];
        estimatedTotalHits?: number;
        totalHits?: number;
        facetDistribution?: Record<string, Record<string, number>>;
      };
      return normalizeSearchResponse(body);
    } catch {
      return queryPgliteSearchDocuments(this.db, input);
    }
  }
}

export function createSearchBackend(db: SqlExecutor): SearchBackend {
  if (!isMeilisearchEnabled()) {
    return new PGliteBackend(db);
  }
  return new MeilisearchBackend(db);
}

export async function upsertMeilisearchDocument(document: SearchDocumentInput): Promise<void> {
  if (!isMeilisearchEnabled()) return;
  const config = meilisearchConfig();
  if (!config) return;

  const payload = {
    id: meilisearchDocumentId(document.orgId, document.sourceKind, document.sourceId),
    orgId: document.orgId,
    projectId: document.projectId ?? null,
    kind: document.sourceKind,
    entityId: document.sourceId,
    title: document.title,
    body: document.body,
    labels: [...(document.labels ?? [])],
    metadata: document.metadata ?? {},
  };

  try {
    const response = await fetch(`${config.url}/indexes/${INDEX_NAME}/documents`, {
      method: "POST",
      headers: meilisearchHeaders(config.key),
      body: JSON.stringify([payload]),
    });
    if (!response.ok) {
      throw new Error(`Meilisearch upsert failed: ${response.status}`);
    }
  } catch {
    // PGlite remains source-of-truth fallback; external index failures must not break writes.
  }
}

function meilisearchConfig(options: { url?: string; key?: string } = {}): { url: string; key?: string } | null {
  const url = (options.url ?? process.env["MEILISEARCH_URL"])?.replace(/\/+$/, "");
  if (!url) return null;
  const key = options.key ?? process.env["MEILISEARCH_KEY"];
  return { url, key };
}

function meilisearchHeaders(key: string | undefined): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (key) headers.set("Authorization", `Bearer ${key}`);
  return headers;
}

function meilisearchDocumentId(orgId: string, kind: string, entityId: string): string {
  return `${orgId}:${kind}:${entityId}`;
}

function searchPayload(input: SearchQueryInput): Record<string, unknown> {
  const filter = buildMeilisearchFilters(input);
  return {
    q: input.q?.trim() ?? "",
    limit: clampLimit(input.limit),
    offset: offsetValue(input.offset),
    filter,
    facets: ["kind", "metadata.doc_type", "metadata.status", "metadata.assignee_id", "metadata.repo_id", "metadata.author_id"],
    showRankingScore: true,
  };
}

function buildMeilisearchFilters(input: SearchQueryInput): string[] {
  const filters = [`orgId = "${escapeFilterValue(input.orgId)}"`];
  if (input.kind) filters.push(`kind = "${escapeFilterValue(input.kind)}"`);
  if (input.projectId) filters.push(`projectId = "${escapeFilterValue(input.projectId)}"`);
  if (input.sprintId) filters.push(`metadata.sprint_id = "${escapeFilterValue(input.sprintId)}"`);
  if (input.docType) filters.push(`metadata.doc_type = "${escapeFilterValue(input.docType)}"`);
  if (input.status) filters.push(`metadata.status = "${escapeFilterValue(input.status)}"`);
  if (input.assigneeId) filters.push(`metadata.assignee_id = "${escapeFilterValue(input.assigneeId)}"`);
  if (input.repoId) filters.push(`metadata.repo_id = "${escapeFilterValue(input.repoId)}"`);
  if (input.authorId) filters.push(`metadata.author_id = "${escapeFilterValue(input.authorId)}"`);
  for (const tag of input.tags ?? []) {
    filters.push(`labels = "${escapeFilterValue(tag)}"`);
  }
  if (input.updatedFrom ?? input.createdFrom) {
    filters.push(`updatedAt >= "${escapeFilterValue((input.updatedFrom ?? input.createdFrom)!.toISOString())}"`);
  }
  if (input.updatedTo ?? input.createdTo) {
    filters.push(`updatedAt <= "${escapeFilterValue((input.updatedTo ?? input.createdTo)!.toISOString())}"`);
  }
  return filters;
}

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeSearchResponse(response: {
  hits?: unknown[];
  estimatedTotalHits?: number;
  totalHits?: number;
  facetDistribution?: Record<string, Record<string, number>>;
}): SearchQueryOutput {
  const hits = response.hits ?? [];
  return {
    results: hits.map(normalizeHit),
    total: response.estimatedTotalHits ?? response.totalHits ?? hits.length,
    facetCounts: {
      kind: response.facetDistribution?.["kind"] ?? {},
      docType: response.facetDistribution?.["metadata.doc_type"] ?? {},
      status: response.facetDistribution?.["metadata.status"] ?? {},
      assigneeId: response.facetDistribution?.["metadata.assignee_id"] ?? {},
      repoId: response.facetDistribution?.["metadata.repo_id"] ?? {},
      authorId: response.facetDistribution?.["metadata.author_id"] ?? {},
    },
  };
}

function normalizeHit(hit: unknown): SearchResult {
  const row = hit as Record<string, unknown>;
  return {
    id: String(row["id"]),
    orgId: String(row["orgId"]),
    projectId: row["projectId"] === null || row["projectId"] === undefined ? null : String(row["projectId"]),
    kind: String(row["kind"]),
    entityId: String(row["entityId"]),
    title: String(row["title"] ?? ""),
    body: String(row["body"] ?? ""),
    labels: Array.isArray(row["labels"]) ? row["labels"].map(String) : [],
    metadata: isRecord(row["metadata"]) ? row["metadata"] : {},
    updatedAt: new Date(String(row["updatedAt"] ?? new Date().toISOString())),
    score: Number(row["_rankingScore"] ?? row["score"] ?? 0),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return 20;
  return Math.max(1, Math.min(100, Math.trunc(limit)));
}

function offsetValue(offset: number | undefined): number {
  if (offset === undefined) return 0;
  return Math.max(0, Math.trunc(offset));
}
