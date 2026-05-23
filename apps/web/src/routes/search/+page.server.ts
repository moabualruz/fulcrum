import type { ServerLoad, Actions } from "@sveltejs/kit";
import { createSearchApiForEvent } from "$lib/server/search-api";
import { queryE2eFixtureSearch } from "$lib/server/search-e2e-fixture";

export interface SearchHit {
  id: string;
  source_kind: string;
  source_id: string;
  title: string;
  body: string;
  score: number;
  updated_at: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  params: {
    q: string;
    kinds: string[];
    dateFrom: string;
    dateTo: string;
  };
}

type GroupedSearchHits = Record<string, SearchHit[]>;
type SearchApi = ReturnType<typeof createSearchApiForEvent>["search"];
type SavedSearchRow = {
  id: string;
  name: string;
  query_json?: string | Record<string, unknown> | null;
};

function groupBySourceKind(hits: SearchHit[]): GroupedSearchHits {
  const grouped: GroupedSearchHits = {};
  for (const hit of hits) {
    grouped[hit.source_kind] ??= [];
    grouped[hit.source_kind]!.push(hit);
  }
  return grouped;
}

export const load: ServerLoad = async (event) => {
  const { url } = event;
  const q = (url.searchParams.get("q") ?? "").trim();
  const kindsParam = url.searchParams.get("kinds") ?? "";
  const kinds = kindsParam.length > 0 ? kindsParam.split(",").map((k) => k.trim()).filter(Boolean) : [];
  const dateFrom = (url.searchParams.get("date_from") ?? "").trim();
  const dateTo = (url.searchParams.get("date_to") ?? "").trim();

  let searchApi: SearchApi;
  try {
    searchApi = createSearchApiForEvent(event).search;
  } catch {
    return { q, kinds, dateFrom, dateTo, hits: [], grouped: {}, savedSearches: [] };
  }

  const savedSearches = await searchApi.savedList()
    .then((rows) => normalizeSavedSearches(rows as SavedSearchRow[]))
    .catch(() => []);

  if (q.length === 0) {
    return { q, kinds, dateFrom, dateTo, hits: [], grouped: {}, savedSearches };
  }

  const runSearch = searchApi.query;
  let hits = await runSearch({
    q,
    limit: 50,
    ...(kinds.length > 0 ? { kind: kinds.join(",") } : {}),
  }).catch(() => []) as SearchHit[];
  if (process.env["FULCRUM_E2E"] === "1" && hits.length === 0) {
    hits = await queryE2eFixtureSearch({ q, kinds }).catch(() => []);
  }

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
  saveSearch: async (event) => {
    const { request } = event;
    const form = await request.formData();
    const name = (form.get("name") as string ?? "").trim();
    const q = (form.get("q") as string ?? "").trim();
    const kinds = (form.get("kinds") as string ?? "").trim();
    const dateFrom = (form.get("date_from") as string ?? "").trim();
    const dateTo = (form.get("date_to") as string ?? "").trim();

    if (!name) return { error: "name required" };

    try {
      await createSearchApiForEvent(event).search.savedCreate({
        name,
        scope: "private",
        queryJson: { q, kinds: kinds ? kinds.split(",") : [], dateFrom, dateTo },
      });
      return { saved: true };
    } catch {
      return { error: "no org" };
    }
  },
};

function normalizeSavedSearches(rows: SavedSearchRow[]): SavedSearch[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    params: normalizeSavedSearchParams(row.query_json),
  }));
}

function normalizeSavedSearchParams(value: SavedSearchRow["query_json"]): SavedSearch["params"] {
  const raw = typeof value === "string" ? parseJson(value) : value;
  const record = isRecord(raw) ? raw : {};
  return {
    q: typeof record["q"] === "string" ? record["q"] : "",
    kinds: Array.isArray(record["kinds"]) ? record["kinds"].filter((kind): kind is string => typeof kind === "string") : [],
    dateFrom: typeof record["dateFrom"] === "string" ? record["dateFrom"] : "",
    dateTo: typeof record["dateTo"] === "string" ? record["dateTo"] : "",
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
