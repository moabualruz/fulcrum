import type { ServerLoad } from "@sveltejs/kit";
import { openProductDb } from "$lib/server/db";
import type { SearchHit } from "../../../../product-kernel/search";
import { querySearchDocuments } from "../../../../search/query.ts";

type ProductDb = Awaited<ReturnType<typeof openProductDb>>;
type GroupedSearchHits = Record<string, SearchHit[]>;
type FacetCounts = {
  kind: Record<string, number>;
  status: Record<string, number>;
  assignee: Record<string, number>;
  project: Record<string, number>;
  author: Record<string, number>;
  tag: Record<string, number>;
};

const DEFAULT_PER_PAGE = 20;

function param(url: URL, key: string): string {
  return (url.searchParams.get(key) ?? "").trim();
}

function positiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function dateParam(value: string, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  const date = new Date(`${value}${value.includes("T") ? "" : suffix}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function emptyFacets(): FacetCounts {
  return { kind: {}, status: {}, assignee: {}, project: {}, author: {}, tag: {} };
}

async function defaultOrgId(db: ProductDb): Promise<string | null> {
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM orgs WHERE slug = $1`,
    ["default"],
  );
  return rows[0]?.id ?? null;
}

function groupBySourceKind(hits: SearchHit[]): GroupedSearchHits {
  const grouped: GroupedSearchHits = {};
  for (const hit of hits) {
    grouped[hit.source_kind] ??= [];
    grouped[hit.source_kind]!.push(hit);
  }
  return grouped;
}

async function facetCount(db: ProductDb, orgId: string, field: "project_id" | "labels"): Promise<Record<string, number>> {
  if (field === "labels") {
    const rows = await db.query<{ value: string; count: number }>(
      `SELECT label AS value, count(*)::int AS count
         FROM search_documents, unnest(labels) AS label
        WHERE org_id = $1
        GROUP BY label
        ORDER BY count DESC, label ASC`,
      [orgId],
    );
    return Object.fromEntries(rows.map((row) => [row.value, Number(row.count)]));
  }

  const rows = await db.query<{ value: string; count: number }>(
    `SELECT project_id AS value, count(*)::int AS count
       FROM search_documents
      WHERE org_id = $1 AND project_id IS NOT NULL
      GROUP BY project_id
      ORDER BY count DESC, project_id ASC`,
    [orgId],
  );
  return Object.fromEntries(rows.map((row) => [row.value, Number(row.count)]));
}

function toHit(result: Awaited<ReturnType<typeof querySearchDocuments>>["results"][number]): SearchHit {
  return {
    id: result.id,
    source_kind: result.kind,
    source_id: result.entityId,
    title: result.title,
    body: result.body,
    score: result.score,
    updated_at: result.updatedAt.toISOString(),
  };
}

export const load: ServerLoad = async ({ url }) => {
  const q = param(url, "q");
  const page = positiveInt(param(url, "page"), 1);
  const perPage = Math.min(100, positiveInt(param(url, "per_page"), DEFAULT_PER_PAGE));
  const params = {
    q,
    kind: param(url, "kind"),
    project: param(url, "project"),
    status: param(url, "status"),
    assignee: param(url, "assignee"),
    tag: param(url, "tag"),
    date_from: param(url, "date_from"),
    date_to: param(url, "date_to"),
    author: param(url, "author"),
    page,
  };
  if (q.length === 0) {
    return {
      q: "",
      hits: [],
      grouped: {},
      facets: emptyFacets(),
      params,
      pagination: { page, perPage, total: 0, hasMore: false },
    };
  }

  const db = await openProductDb();
  try {
    const orgId = await defaultOrgId(db);
    if (!orgId) {
      return {
        q,
        hits: [],
        grouped: {},
        facets: emptyFacets(),
        params,
        pagination: { page, perPage, total: 0, hasMore: false },
      };
    }

    const result = await querySearchDocuments(db, {
      orgId,
      q,
      kind: params.kind || undefined,
      projectId: params.project || undefined,
      status: params.status || undefined,
      assigneeId: params.assignee || undefined,
      tags: params.tag ? [params.tag] : undefined,
      authorId: params.author || undefined,
      updatedFrom: dateParam(params.date_from),
      updatedTo: dateParam(params.date_to, true),
      limit: perPage,
      offset: (page - 1) * perPage,
    });
    const hits = result.results.map(toHit);
    const facets: FacetCounts = {
      kind: result.facetCounts.kind,
      status: result.facetCounts.status,
      assignee: result.facetCounts.assigneeId,
      project: await facetCount(db, orgId, "project_id"),
      author: result.facetCounts.authorId,
      tag: await facetCount(db, orgId, "labels"),
    };
    return {
      q,
      hits,
      grouped: groupBySourceKind(hits),
      facets,
      params,
      pagination: {
        page,
        perPage,
        total: result.total,
        hasMore: page * perPage < result.total,
      },
    };
  } finally {
    await db.close();
  }
};
