export type InContextSearchKind = "task" | "doc" | "run" | "artifact" | "repo" | string;

export type SearchFacetCounts = Record<string, Record<string, number>>;

export interface PublicSearchHit {
  id: string;
  source_kind: string;
  source_id: string;
  title: string;
  body: string;
  score: number;
  updated_at: string;
  project_id?: string | null;
  status?: string | null;
  labels?: string[] | null;
}

export interface NormalizedSearchResult {
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

export interface SearchResultFilters {
  kinds?: string[];
  projectIds?: string[];
  statuses?: string[];
}

export interface SearchResultRef {
  entityId?: string;
  source_id?: string;
}

export interface SearchQueryBuildInput {
  kind: InContextSearchKind;
  projectId?: string | null;
  value: string;
  limit?: number;
}

export interface ParsedQuickFilters {
  q: string;
  filters: {
    status?: string;
    assigneeId?: string;
    docType?: string;
    repoId?: string;
    authorId?: string;
    tags?: string[];
  };
}

const TOKEN_MAP: Record<string, keyof ParsedQuickFilters["filters"]> = {
  status: "status",
  assignee: "assigneeId",
  assignee_id: "assigneeId",
  doc_type: "docType",
  type: "docType",
  repo: "repoId",
  repo_id: "repoId",
  author: "authorId",
  author_id: "authorId",
  tag: "tags",
};

export function parseQuickFilterTokens(value: string): ParsedQuickFilters {
  const filters: ParsedQuickFilters["filters"] = {};
  const text: string[] = [];

  for (const raw of value.trim().split(/\s+/).filter(Boolean)) {
    const match = raw.match(/^([a-z_]+):(.+)$/i);
    if (!match) {
      text.push(raw);
      continue;
    }

    const key = TOKEN_MAP[match[1]!.toLowerCase()];
    if (!key) {
      text.push(raw);
      continue;
    }

    const tokenValue = match[2]!;
    if (key === "tags") {
      filters.tags = [...(filters.tags ?? []), tokenValue];
    } else {
      filters[key] = tokenValue;
    }
  }

  return { q: text.join(" "), filters };
}

export function buildSearchQueryInput(input: SearchQueryBuildInput) {
  const parsed = parseQuickFilterTokens(input.value);
  return {
    q: parsed.q,
    kind: input.kind,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    ...parsed.filters,
    limit: input.limit ?? 20,
  };
}

export function searchPublicApiHeaders(apiToken?: string | null): HeadersInit {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiToken?.trim()) headers.authorization = `Bearer ${apiToken}`;
  return headers;
}

export function searchPublicApiPath(path: string, query: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && String(value).trim()) params.set(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export function normalizeSearchHit(hit: PublicSearchHit): NormalizedSearchResult {
  return {
    id: hit.id,
    entityKind: hit.source_kind,
    entityId: hit.source_id,
    title: hit.title,
    body: hit.body,
    labels: Array.isArray(hit.labels) ? hit.labels : null,
    metadata: { updatedAt: hit.updated_at },
    projectId: stringOrNull(hit.project_id),
    status: stringOrNull(hit.status),
    rank: hit.score,
    snippet: hit.body,
  };
}

export function buildSearchFacets(nextResults: NormalizedSearchResult[]): SearchFacetCounts {
  return nextResults.reduce<SearchFacetCounts>((next, result) => {
    next["kind"] ??= {};
    next["kind"][result.entityKind] = (next["kind"][result.entityKind] ?? 0) + 1;
    if (result.projectId) {
      next["project"] ??= {};
      next["project"][result.projectId] = (next["project"][result.projectId] ?? 0) + 1;
    }
    if (result.status) {
      next["status"] ??= {};
      next["status"][result.status] = (next["status"][result.status] ?? 0) + 1;
    }
    return next;
  }, {});
}

export function buildSearchFacetCounts(results: PublicSearchHit[]): SearchFacetCounts {
  return buildSearchFacets(results.map(normalizeSearchHit));
}

export function filterSearchResults(
  results: NormalizedSearchResult[],
  filters: SearchResultFilters,
): NormalizedSearchResult[] {
  return results.filter((result) => {
    if (filters.kinds?.length && !filters.kinds.includes(result.entityKind)) return false;
    if (filters.projectIds?.length && (!result.projectId || !filters.projectIds.includes(result.projectId))) {
      return false;
    }
    if (filters.statuses?.length && (!result.status || !filters.statuses.includes(result.status))) return false;
    return true;
  });
}

export function highlightedSegments(text: string, query: string): Array<{ text: string; match: boolean }> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [{ text, match: false }];
  const segments: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  const source = text.toLowerCase();
  while (cursor < text.length) {
    const index = source.indexOf(normalizedQuery, cursor);
    if (index === -1) {
      segments.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (index > cursor) segments.push({ text: text.slice(cursor, index), match: false });
    segments.push({ text: text.slice(index, index + normalizedQuery.length), match: true });
    cursor = index + normalizedQuery.length;
  }
  return segments;
}

export function filterItemsForSearchResults<T extends { id: string }>(
  items: T[],
  results: SearchResultRef[],
  query: string,
): T[] {
  if (query.trim() === "") return items;
  const ids = new Set(results.map((result) => result.entityId ?? result.source_id).filter(Boolean));
  return items.filter((item) => ids.has(item.id));
}

export function appendFacetToken(value: string, facet: string, token: string): string {
  return [value.trim(), `${facet}:${token}`].filter(Boolean).join(" ");
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
