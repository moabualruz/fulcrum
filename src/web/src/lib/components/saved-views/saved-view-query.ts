export type SavedViewScope = "private" | "project" | "org";
export type SavedViewType = "board" | "list" | "table" | "calendar" | "timeline";
export type FilterClause = { field: string; op: string; value?: unknown };
export type SavedViewQuery = {
  filters: FilterClause[];
  text: string;
  facets: Record<string, string[]>;
};

export interface SavedViewLink {
  id: string;
  viewType: SavedViewType;
  queryJson: SavedViewQuery;
}

export const emptySavedViewQuery = (): SavedViewQuery => ({ filters: [], text: "", facets: {} });

export function normalizeSavedViewQuery(value: unknown): SavedViewQuery {
  if (!value || typeof value !== "object") return emptySavedViewQuery();
  const candidate = value as Partial<SavedViewQuery>;
  return {
    filters: Array.isArray(candidate.filters)
      ? candidate.filters.filter((filter): filter is FilterClause =>
          !!filter && typeof filter === "object" && typeof filter.field === "string" && typeof filter.op === "string",
        )
      : [],
    text: typeof candidate.text === "string" ? candidate.text : "",
    facets: candidate.facets && typeof candidate.facets === "object" ? normalizeFacets(candidate.facets) : {},
  };
}

function normalizeFacets(value: object): Record<string, string[]> {
  const facets: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (Array.isArray(raw)) facets[key] = raw.map(String);
  }
  return facets;
}

export function encodeSavedViewParam(query: SavedViewQuery): string {
  return btoa(JSON.stringify(normalizeSavedViewQuery(query)));
}

export function decodeSavedViewParam(value: string | null): SavedViewQuery {
  if (!value) return emptySavedViewQuery();
  try {
    return normalizeSavedViewQuery(JSON.parse(atob(value)));
  } catch {
    return emptySavedViewQuery();
  }
}

export function encodeSavedViewFormValue(query: SavedViewQuery): string {
  return encodeURIComponent(JSON.stringify(normalizeSavedViewQuery(query)));
}

export function decodeSavedViewFormValue(value: string): SavedViewQuery {
  try {
    return normalizeSavedViewQuery(JSON.parse(decodeURIComponent(value)));
  } catch {
    return emptySavedViewQuery();
  }
}

export function filterChipLabel(filter: FilterClause): string {
  if (!("value" in filter)) return `${filter.field} ${filter.op}`;
  return `${filter.field} ${filter.op} ${Array.isArray(filter.value) ? filter.value.join(", ") : String(filter.value)}`;
}

export function savedViewHref(projectId: string, view: SavedViewLink): string {
  const route = view.viewType === "board" ? "board" : view.viewType;
  const params = new URLSearchParams({
    view: encodeSavedViewParam(view.queryJson),
    savedView: view.id,
  });
  return `/projects/${projectId}/${route}?${params.toString()}`;
}
