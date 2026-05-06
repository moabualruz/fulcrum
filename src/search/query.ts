import type { ProductDb, SqlValue } from "../product-kernel/db/types.ts";
import { createSearchBackend } from "./backend.ts";
import {
  type EmbedText,
  cosineSimilarity,
  ensureEmbeddingIndex,
  isEmbeddingsEnabled,
  parseEmbedding,
} from "./embeddings.ts";
import type { SearchIndexKind } from "./indexers/base.ts";

export interface SearchQueryInput {
  orgId: string;
  q?: string;
  kind?: SearchIndexKind | string;
  projectId?: string;
  sprintId?: string;
  docType?: string;
  status?: string;
  assigneeId?: string;
  tags?: readonly string[];
  repoId?: string;
  authorId?: string;
  updatedFrom?: Date;
  updatedTo?: Date;
  createdFrom?: Date;
  createdTo?: Date;
  limit?: number;
  offset?: number;
  now?: Date;
  embedQuery?: EmbedText;
}

export interface SearchResult {
  id: string;
  orgId: string;
  projectId: string | null;
  kind: string;
  entityId: string;
  title: string;
  body: string;
  labels: string[];
  metadata: Record<string, unknown>;
  updatedAt: Date;
  score: number;
}

export interface SearchQueryOutput {
  results: SearchResult[];
  total: number;
  facetCounts: {
    kind: Record<string, number>;
    docType: Record<string, number>;
    status: Record<string, number>;
    assigneeId: Record<string, number>;
    repoId: Record<string, number>;
    authorId: Record<string, number>;
  };
}

type Where = {
  sql: string;
  params: SqlValue[];
  hasQuery: boolean;
  query: string;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.trunc(limit)));
}

function offsetValue(offset: number | undefined): number {
  if (offset === undefined) return 0;
  return Math.max(0, Math.trunc(offset));
}

function textArrayLiteral(values: readonly string[]): string {
  return `{${values.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

function buildWhere(input: SearchQueryInput): Where {
  const params: SqlValue[] = [input.orgId];
  const clauses = ["org_id = $1"];
  const query = input.q?.trim() ?? "";

  if (query !== "") {
    params.push(query);
    clauses.push(`search_vector @@ plainto_tsquery('english', $${params.length})`);
  }
  if (input.kind) {
    params.push(input.kind);
    clauses.push(`source_kind = $${params.length}`);
  }
  if (input.projectId) {
    params.push(input.projectId);
    clauses.push(`project_id = $${params.length}`);
  }
  if (input.sprintId) {
    params.push(input.sprintId);
    clauses.push(`metadata ->> 'sprint_id' = $${params.length}`);
  }
  if (input.docType) {
    params.push(input.docType);
    clauses.push(`metadata ->> 'doc_type' = $${params.length}`);
  }
  if (input.status) {
    params.push(input.status);
    clauses.push(`metadata ->> 'status' = $${params.length}`);
  }
  if (input.assigneeId) {
    params.push(input.assigneeId);
    clauses.push(`metadata ->> 'assignee_id' = $${params.length}`);
  }
  if (input.tags && input.tags.length > 0) {
    params.push(textArrayLiteral(input.tags));
    clauses.push(`labels @> $${params.length}::text[]`);
  }
  if (input.repoId) {
    params.push(input.repoId);
    clauses.push(`metadata ->> 'repo_id' = $${params.length}`);
  }
  if (input.authorId) {
    params.push(input.authorId);
    clauses.push(`metadata ->> 'author_id' = $${params.length}`);
  }

  const updatedFrom = input.updatedFrom ?? input.createdFrom;
  const updatedTo = input.updatedTo ?? input.createdTo;
  if (updatedFrom) {
    params.push(updatedFrom.toISOString());
    clauses.push(`updated_at >= $${params.length}::timestamptz`);
  }
  if (updatedTo) {
    params.push(updatedTo.toISOString());
    clauses.push(`updated_at <= $${params.length}::timestamptz`);
  }

  return {
    sql: clauses.join(" AND "),
    params,
    hasQuery: query !== "",
    query,
  };
}

function buildHybridWhere(input: SearchQueryInput): Where {
  return buildWhere({ ...input, q: undefined });
}

function baseScoreSql(where: Where, nowParamIndex: number): string {
  const rankSql = where.hasQuery
    ? `ts_rank_cd(search_vector, plainto_tsquery('english', $2))`
    : "0";

  return `
    ${rankSql}
    + (0.3 * exp(-(greatest(extract(epoch from ($${nowParamIndex}::timestamptz - updated_at)) / 86400.0, 0) / 14.0)))
    + CASE
        WHEN source_kind = 'task'
          AND coalesce(metadata ->> 'status', '') NOT IN ('done', 'completed', 'closed', 'cancelled') THEN 0.5
        WHEN source_kind = 'memory' AND metadata ->> 'importance' = 'high' THEN 0.4
        WHEN source_kind = 'doc' AND metadata ->> 'doc_type' IN ('spec', 'adr', 'runbook') THEN 0.2
        WHEN source_kind = 'run' AND coalesce(metadata ->> 'status', '') IN ('done', 'completed', 'success', 'succeeded') THEN 0.1
        ELSE 0
      END
  `;
}

function resultsSql(where: Where, nowParamIndex: number, limitParamIndex: number, offsetParamIndex: number): string {
  return `
    WITH ranked AS (
      SELECT
        id,
        org_id,
        project_id,
        source_kind,
        source_id,
        title,
        body,
        labels,
        metadata,
        updated_at,
        (${baseScoreSql(where, nowParamIndex)})::float8 AS score,
        row_number() OVER (
          PARTITION BY org_id, source_kind, source_id
          ORDER BY updated_at DESC, id DESC
        ) AS dedupe_rank
      FROM search_documents
      WHERE ${where.sql}
    ),
    deduped AS (
      SELECT * FROM ranked WHERE dedupe_rank = 1
    ),
    counted AS (
      SELECT *, count(*) OVER ()::int AS total_count
      FROM deduped
      ORDER BY score DESC, updated_at DESC, id ASC
      LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
    )
    SELECT
      id,
      org_id,
      project_id,
      source_kind,
      source_id,
      title,
      body,
      labels,
      metadata,
      updated_at,
      score,
      total_count
    FROM counted
  `;
}

function hybridResultsSql(where: Where, originalWhere: Where, nowParamIndex: number): string {
  return `
    WITH ranked AS (
      SELECT
        id,
        org_id,
        project_id,
        source_kind,
        source_id,
        title,
        body,
        labels,
        metadata,
        embedding,
        updated_at,
        (${baseScoreSql(originalWhere, nowParamIndex)})::float8 AS bm25_score,
        row_number() OVER (
          PARTITION BY org_id, source_kind, source_id
          ORDER BY updated_at DESC, id DESC
        ) AS dedupe_rank
      FROM search_documents
      WHERE ${where.sql}
    )
    SELECT
      id,
      org_id,
      project_id,
      source_kind,
      source_id,
      title,
      body,
      labels,
      metadata,
      embedding,
      updated_at,
      bm25_score
    FROM ranked
    WHERE dedupe_rank = 1
  `;
}

async function facetCount(
  db: ProductDb,
  where: Where,
  selector: string,
): Promise<Record<string, number>> {
  const rows = await db.query<{ value: string | null; count: number }>(
    `
      WITH deduped AS (
        SELECT DISTINCT ON (org_id, source_kind, source_id)
          ${selector} AS value,
          updated_at,
          id
        FROM search_documents
        WHERE ${where.sql}
        ORDER BY org_id, source_kind, source_id, updated_at DESC, id DESC
      )
      SELECT value, count(*)::int AS count
      FROM deduped
      WHERE value IS NOT NULL AND value <> ''
      GROUP BY value
      ORDER BY count DESC, value ASC
    `,
    where.params,
  );

  return Object.fromEntries(rows.map((row) => [row.value!, Number(row.count)]));
}

function normalizeRow(row: {
  id: string;
  org_id: string;
  project_id: string | null;
  source_kind: string;
  source_id: string;
  title: string;
  body: string;
  labels: string[];
  metadata: Record<string, unknown>;
  updated_at: Date | string;
  score: number;
}): SearchResult {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    kind: row.source_kind,
    entityId: row.source_id,
    title: row.title,
    body: row.body,
    labels: row.labels,
    metadata: row.metadata,
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
    score: Number(row.score),
  };
}

function normalizeHybridRow(
  row: {
    id: string;
    org_id: string;
    project_id: string | null;
    source_kind: string;
    source_id: string;
    title: string;
    body: string;
    labels: string[];
    metadata: Record<string, unknown>;
    updated_at: Date | string;
  },
  score: number,
): SearchResult {
  return normalizeRow({ ...row, score });
}

async function queryHybridSearchDocuments(
  db: ProductDb,
  input: SearchQueryInput,
  where: Where,
): Promise<SearchQueryOutput> {
  await ensureEmbeddingIndex(db);

  const hybridWhere = buildHybridWhere(input);
  const now = (input.now ?? new Date()).toISOString();
  const nowParamIndex = where.params.length + 1;
  const queryVector = input.embedQuery ? await input.embedQuery(where.query) : [];
  const rows = await db.query<{
    id: string;
    org_id: string;
    project_id: string | null;
    source_kind: string;
    source_id: string;
    title: string;
    body: string;
    labels: string[];
    metadata: Record<string, unknown>;
    embedding: string | number[] | null;
    updated_at: Date | string;
    bm25_score: number;
  }>(hybridResultsSql(hybridWhere, where, nowParamIndex), [...where.params, now]);

  const maxBm25 = Math.max(...rows.map((row) => Number(row.bm25_score)), 0);
  const scored = rows
    .map((row) => {
      const normalizedBm25 = maxBm25 > 0 ? Number(row.bm25_score) / maxBm25 : 0;
      const embedding = parseEmbedding(row.embedding);
      const semanticScore = embedding ? cosineSimilarity(queryVector, embedding) : 0;
      return {
        row,
        score: 0.35 * normalizedBm25 + 0.65 * semanticScore,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const updatedAt = new Date(right.row.updated_at).getTime() - new Date(left.row.updated_at).getTime();
      if (updatedAt !== 0) return updatedAt;
      return left.row.id.localeCompare(right.row.id);
    });

  const offset = offsetValue(input.offset);
  const limit = clampLimit(input.limit);
  const page = scored.slice(offset, offset + limit);
  const [kind, docType, status, assigneeId, repoId, authorId] = await Promise.all([
    facetCount(db, hybridWhere, "source_kind"),
    facetCount(db, hybridWhere, "metadata ->> 'doc_type'"),
    facetCount(db, hybridWhere, "metadata ->> 'status'"),
    facetCount(db, hybridWhere, "metadata ->> 'assignee_id'"),
    facetCount(db, hybridWhere, "metadata ->> 'repo_id'"),
    facetCount(db, hybridWhere, "metadata ->> 'author_id'"),
  ]);

  return {
    results: page.map((entry) => normalizeHybridRow(entry.row, entry.score)),
    total: scored.length,
    facetCounts: { kind, docType, status, assigneeId, repoId, authorId },
  };
}

export async function queryPgliteSearchDocuments(
  db: ProductDb,
  input: SearchQueryInput,
): Promise<SearchQueryOutput> {
  const where = buildWhere(input);
  if (where.hasQuery && isEmbeddingsEnabled()) {
    return queryHybridSearchDocuments(db, input, where);
  }
  const now = (input.now ?? new Date()).toISOString();
  const limit = clampLimit(input.limit);
  const offset = offsetValue(input.offset);
  const nowParamIndex = where.params.length + 1;
  const limitParamIndex = where.params.length + 2;
  const offsetParamIndex = where.params.length + 3;
  const params = [...where.params, now, limit, offset];

  const rows = await db.query<{
    id: string;
    org_id: string;
    project_id: string | null;
    source_kind: string;
    source_id: string;
    title: string;
    body: string;
    labels: string[];
    metadata: Record<string, unknown>;
    updated_at: Date | string;
    score: number;
    total_count: number;
  }>(resultsSql(where, nowParamIndex, limitParamIndex, offsetParamIndex), params);

  const [kind, docType, status, assigneeId, repoId, authorId] = await Promise.all([
    facetCount(db, where, "source_kind"),
    facetCount(db, where, "metadata ->> 'doc_type'"),
    facetCount(db, where, "metadata ->> 'status'"),
    facetCount(db, where, "metadata ->> 'assignee_id'"),
    facetCount(db, where, "metadata ->> 'repo_id'"),
    facetCount(db, where, "metadata ->> 'author_id'"),
  ]);

  return {
    results: rows.map(normalizeRow),
    total: rows[0]?.total_count ?? 0,
    facetCounts: { kind, docType, status, assigneeId, repoId, authorId },
  };
}

export async function querySearchDocuments(
  db: ProductDb,
  input: SearchQueryInput,
): Promise<SearchQueryOutput> {
  return createSearchBackend(db).query(input);
}
