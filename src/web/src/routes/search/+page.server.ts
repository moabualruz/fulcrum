import type { ServerLoad, Actions } from "@sveltejs/kit";
import { getEm, getDefaultOrgIdOrm } from "$lib/server/em";
import {
  listSavedSearches,
  saveSearch,
  searchDocuments,
} from "../../../../application/search/queries.ts";
import type { SavedSearch, SearchHit, SearchParams } from "../../../../application/search/types.ts";

type GroupedSearchHits = Record<string, SearchHit[]>;

function groupBySourceKind(hits: SearchHit[]): GroupedSearchHits {
  const grouped: GroupedSearchHits = {};
  for (const hit of hits) {
    grouped[hit.source_kind] ??= [];
    grouped[hit.source_kind]!.push(hit);
  }
  return grouped;
}

export const load: ServerLoad = async ({ url }) => {
  const q = (url.searchParams.get("q") ?? "").trim();
  const kindsParam = url.searchParams.get("kinds") ?? "";
  const kinds = kindsParam.length > 0 ? kindsParam.split(",").map((k) => k.trim()).filter(Boolean) : [];
  const dateFrom = (url.searchParams.get("date_from") ?? "").trim();
  const dateTo = (url.searchParams.get("date_to") ?? "").trim();

  const em = await getEm();
  let orgId: string;
  try {
    orgId = await getDefaultOrgIdOrm(em);
  } catch {
    return { q, kinds, dateFrom, dateTo, hits: [], grouped: {}, savedSearches: [] };
  }

  const savedSearches: SavedSearch[] = await listSavedSearches(em, { orgId, userId: "local" }, "local")
    .catch(() => []);

  if (q.length === 0) {
    return { q, kinds, dateFrom, dateTo, hits: [], grouped: {}, savedSearches };
  }

  const filters = {
    orgId,
    limit: 50,
    ...(kinds.length > 0 ? { sourceKinds: kinds } : {}),
  };

  let hits = await searchDocuments(em, q, filters);

  // Apply date range filter in memory (updated_at is an ISO string)
  if (dateFrom) {
    hits = hits.filter((h) => h.updated_at >= dateFrom);
  }
  if (dateTo) {
    const ceiling = dateTo.length === 10 ? `${dateTo}T23:59:59` : dateTo;
    hits = hits.filter((h) => h.updated_at <= ceiling);
  }

  return { q, kinds, dateFrom, dateTo, hits, grouped: groupBySourceKind(hits), savedSearches };
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

    const em = await getEm();
    try {
      const orgId = await getDefaultOrgIdOrm(em);

      const params: SearchParams = { q, kinds: kinds ? kinds.split(",") : [], dateFrom, dateTo };
      await saveSearch(em, { orgId, userId: "local" }, { owner: "local", name, params });
      return { saved: true };
    } catch {
      return { error: "no org" };
    }
  },
};
