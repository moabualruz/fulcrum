import type { ServerLoad, Actions } from "@sveltejs/kit";
import { openProductDb } from "$lib/server/db";
import { searchProductDocuments } from "@fulcrum/product-kernel/search.ts";
import type { SearchHit } from "@fulcrum/product-kernel/search";
import { newUlid } from "@fulcrum/product-kernel/ids.ts";

type ProductDb = Awaited<ReturnType<typeof openProductDb>>;
type GroupedSearchHits = Record<string, SearchHit[]>;

export interface SavedSearch {
  id: string;
  name: string;
  params: SearchParams;
}

export interface SearchParams {
  q: string;
  kinds: string[];
  dateFrom: string;
  dateTo: string;
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

async function listSavedSearches(
  db: ProductDb,
  orgId: string,
  owner: string,
): Promise<SavedSearch[]> {
  const rows = await db.query<{ id: string; name: string; params: unknown }>(
    `SELECT id, name, params FROM saved_searches
      WHERE org_id = $1 AND owner = $2
      ORDER BY created_at DESC`,
    [orgId, owner],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    params: (typeof r.params === "string" ? JSON.parse(r.params) : r.params) as SearchParams,
  }));
}

export const load: ServerLoad = async ({ url }) => {
  const q = (url.searchParams.get("q") ?? "").trim();
  const kindsParam = url.searchParams.get("kinds") ?? "";
  const kinds = kindsParam.length > 0 ? kindsParam.split(",").map((k) => k.trim()).filter(Boolean) : [];
  const dateFrom = (url.searchParams.get("date_from") ?? "").trim();
  const dateTo = (url.searchParams.get("date_to") ?? "").trim();

  const db = await openProductDb();
  try {
    const orgId = await defaultOrgId(db);
    if (!orgId) return { q, kinds, dateFrom, dateTo, hits: [], grouped: {}, savedSearches: [] };

    const savedSearches = await listSavedSearches(db, orgId, "local");

    if (q.length === 0) {
      return { q, kinds, dateFrom, dateTo, hits: [], grouped: {}, savedSearches };
    }

    const filters: import("../../../../product-kernel/search").SearchFilters = {
      orgId,
      limit: 50,
      ...(kinds.length > 0 ? { sourceKinds: kinds } : {}),
    };

    let hits = await searchProductDocuments(db, q, filters);

    // Apply date range filter in memory (updated_at is an ISO string)
    if (dateFrom) {
      hits = hits.filter((h) => h.updated_at >= dateFrom);
    }
    if (dateTo) {
      const ceiling = dateTo.length === 10 ? `${dateTo}T23:59:59` : dateTo;
      hits = hits.filter((h) => h.updated_at <= ceiling);
    }

    return { q, kinds, dateFrom, dateTo, hits, grouped: groupBySourceKind(hits), savedSearches };
  } finally {
    await db.close();
  }
};

export const actions: Actions = {
  saveSearch: async ({ request }) => {
    const form = await request.formData();
    const name = (form.get("name") as string ?? "").trim();
    const q = (form.get("q") as string ?? "").trim();
    const kinds = (form.get("kinds") as string ?? "").trim();
    const dateFrom = (form.get("date_from") as string ?? "").trim();
    const dateTo = (form.get("date_to") as string ?? "").trim();

    if (!name) return { error: "name required" };

    const db = await openProductDb();
    try {
      const rows = await db.query<{ id: string }>(`SELECT id FROM orgs WHERE slug = $1`, ["default"]);
      const orgId = rows[0]?.id;
      if (!orgId) return { error: "no org" };

      const id = newUlid();
      const params = JSON.stringify({ q, kinds: kinds ? kinds.split(",") : [], dateFrom, dateTo });
      await db.query(
        `INSERT INTO saved_searches (id, org_id, owner, name, params)
         VALUES ($1, $2, $3, $4, $5::jsonb)
         ON CONFLICT (org_id, owner, name) DO UPDATE SET params = EXCLUDED.params`,
        [id, orgId, "local", name, params],
      );
      return { saved: true };
    } finally {
      await db.close();
    }
  },
};
