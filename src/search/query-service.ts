/**
 * SearchQueryService — PGlite FTS query with ts_rank, facets, and filters.
 *
 * Security (T-06-07): All queries filter by org_id from authenticated context.
 * Security (T-06-08): Parameterized queries only — no string interpolation of user input.
 * Security (T-06-09): Default limit=20, max limit=100 enforced in Zod schema (search.ts router).
 */

import { injectable as Injectable } from "@needle-di/core";
import type { ProductDb } from "../product-kernel/db/types.ts";

export interface SearchQueryInput {
  term: string;
  filters?: {
    kinds?: string[];
    projectIds?: string[];
    statuses?: string[];
    dateRange?: { from?: string; to?: string };
  };
  facets?: boolean;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  id: string;
  entityKind: string;
  entityId: string;
  title: string | null;
  body: string | null;
  labels: string[] | null;
  metadata: Record<string, unknown> | null;
  projectId: string | null;
  status: string | null;
  rank: number;
  snippet: string;
}

export interface SearchQueryOutput {
  results: SearchResult[];
  total: number;
  facets?: Record<string, Record<string, number>>;
}

interface SearchDocRow {
  id: string;
  entity_kind: string;
  entity_id: string;
  title: string | null;
  body: string | null;
  labels: string[] | null;
  metadata: Record<string, unknown> | null;
  project_id: string | null;
  status: string | null;
  rank: number;
  snippet: string;
}

interface FacetRow {
  value: string;
  count: string;
}

@Injectable()
export class SearchQueryService {
  constructor(private readonly db: ProductDb) {}

  async query(orgId: string, input: SearchQueryInput): Promise<SearchQueryOutput> {
    const { term, filters, facets = false, limit = 20, offset = 0 } = input;

    // T-06-09: Empty term guard — no full-table scan
    if (!term.trim()) return { results: [], total: 0 };

    const params: (string | number | string[] | null)[] = [orgId, term.trim()];
    const whereClauses: string[] = [
      "org_id = $1",
      "to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')) @@ plainto_tsquery('english', $2)",
    ];

    // T-06-08: All filters use parameterized placeholders
    if (filters?.kinds?.length) {
      params.push(filters.kinds);
      whereClauses.push(`entity_kind = ANY($${params.length}::text[])`);
    }

    if (filters?.projectIds?.length) {
      params.push(filters.projectIds);
      whereClauses.push(`project_id = ANY($${params.length}::text[])`);
    }

    if (filters?.statuses?.length) {
      params.push(filters.statuses);
      whereClauses.push(`status = ANY($${params.length}::text[])`);
    }

    if (filters?.dateRange?.from) {
      params.push(filters.dateRange.from);
      whereClauses.push(`updated_at >= $${params.length}`);
    }

    if (filters?.dateRange?.to) {
      params.push(filters.dateRange.to);
      whereClauses.push(`updated_at <= $${params.length}`);
    }

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const where = whereClauses.join(" AND ");

    const rows = await this.db.query<SearchDocRow>(
      `SELECT id,
              entity_kind,
              entity_id,
              title,
              body,
              labels,
              metadata,
              project_id,
              status,
              ts_rank(
                to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')),
                plainto_tsquery('english', $2)
              ) AS rank,
              ts_headline(
                'english',
                coalesce(title,'') || ' ' || coalesce(body,''),
                plainto_tsquery('english', $2),
                'MaxFragments=1,MaxWords=20,MinWords=5'
              ) AS snippet
         FROM search_documents
        WHERE ${where}
        ORDER BY rank DESC, updated_at DESC
        LIMIT $${limitIdx}
       OFFSET $${offsetIdx}`,
      params as never,
    );

    const results: SearchResult[] = rows.map((row) => ({
      id: row.id,
      entityKind: row.entity_kind,
      entityId: row.entity_id,
      title: row.title,
      body: row.body,
      labels: row.labels,
      metadata: row.metadata,
      projectId: row.project_id,
      status: row.status,
      rank: Number(row.rank),
      snippet: row.snippet ?? "",
    }));

    if (!facets) {
      return { results, total: results.length };
    }

    // Facet queries — separate COUNT GROUP BY for kind, project, status
    const facetWhere = whereClauses.slice(0, whereClauses.length - 0).join(" AND ");
    // Use only the base params (without limit/offset) for facet queries
    const facetParams = params.slice(0, params.length - 2);

    const [kindRows, projectRows, statusRows] = await Promise.all([
      this.db.query<FacetRow>(
        `SELECT entity_kind AS value, COUNT(*)::text AS count FROM search_documents WHERE ${facetWhere} GROUP BY entity_kind`,
        facetParams as never,
      ),
      this.db.query<FacetRow>(
        `SELECT project_id AS value, COUNT(*)::text AS count FROM search_documents WHERE ${facetWhere} GROUP BY project_id`,
        facetParams as never,
      ),
      this.db.query<FacetRow>(
        `SELECT status AS value, COUNT(*)::text AS count FROM search_documents WHERE ${facetWhere} GROUP BY status`,
        facetParams as never,
      ),
    ]);

    const toFacetMap = (rows: FacetRow[]): Record<string, number> =>
      Object.fromEntries(rows.filter((r) => r.value != null).map((r) => [r.value, Number(r.count)]));

    return {
      results,
      total: results.length,
      facets: {
        kind: toFacetMap(kindRows),
        project: toFacetMap(projectRows),
        status: toFacetMap(statusRows),
      },
    };
  }

  /** suggest — ILIKE prefix match for autocomplete / CLI */
  async suggest(orgId: string, term: string, limit = 10): Promise<string[]> {
    if (!term.trim()) return [];
    const rows = await this.db.query<{ title: string }>(
      `SELECT title FROM search_documents WHERE org_id = $1 AND title ILIKE $2 LIMIT $3`,
      [orgId, `%${term}%`, limit],
    );
    return rows.map((r) => r.title).filter(Boolean);
  }
}
