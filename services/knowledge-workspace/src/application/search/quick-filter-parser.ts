import type { SearchIndexKind } from "./indexers/base.ts";

export interface QuickFilterFilters {
  kind?: SearchIndexKind | string;
  projectSlug?: string;
  assignee?: string;
  status?: string;
  tags?: string[];
}

export interface QuickFilterParseResult {
  cleanQuery: string;
  filters: QuickFilterFilters;
}

const FILTER_KEYS = new Set(["kind", "project", "assignee", "status", "tag"]);

function applyFilter(filters: QuickFilterFilters, key: string, value: string): void {
  switch (key) {
    case "kind":
      filters.kind = value;
      break;
    case "project":
      filters.projectSlug = value;
      break;
    case "assignee":
      filters.assignee = value === "me" ? "$me" : value;
      break;
    case "status":
      filters.status = value;
      break;
    case "tag":
      filters.tags = [...(filters.tags ?? []), value];
      break;
  }
}

export function parseQuickFilter(rawQuery: string): QuickFilterParseResult {
  const filters: QuickFilterFilters = {};
  const tokens = rawQuery.trim().split(/\s+/).filter(Boolean);
  let queryStart = 0;

  for (const token of tokens) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):(.+)$/.exec(token);
    if (!match) break;

    const rawKey = match[1]!;
    const value = match[2]!;
    const key = rawKey.toLowerCase();
    if (!FILTER_KEYS.has(key)) break;

    applyFilter(filters, key, value);
    queryStart += 1;
  }

  return {
    cleanQuery: tokens.slice(queryStart).join(" "),
    filters,
  };
}
