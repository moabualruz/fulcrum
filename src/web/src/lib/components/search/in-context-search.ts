export type InContextSearchKind = "task" | "doc" | "run" | "artifact" | "repo" | string;

export type SearchFacetCounts = Record<string, Record<string, number>>;

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
