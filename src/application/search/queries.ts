import { randomUUID } from "node:crypto";
import type { EntityManager } from "@mikro-orm/postgresql";

import { Org } from "../../db/entities/auth/Org.ts";
import { SearchDocument } from "../../db/entities/search/SearchDocument.ts";
import { SavedView } from "../../db/entities/tasks/SavedView.ts";
import type { SavedViewQuery } from "../../filters/ast.ts";
import type { SavedSearch, SearchApplicationContext, SearchFilters, SearchHit, SearchParams } from "./types.ts";

export function searchApplicationScope(ctx: SearchApplicationContext): SearchApplicationContext {
  return ctx;
}

export async function searchDocuments(
  em: EntityManager,
  query: string,
  filters: SearchFilters,
): Promise<SearchHit[]> {
  const limit = filters.limit ?? 25;
  const normalized = query.trim().toLowerCase();
  const scopeFilter = filters.scope ?? "current";
  const rows = await em.find(SearchDocument, {
    org: filters.orgId,
    ...(scopeFilter === "all"
      ? {}
      : scopeFilter === "global"
        ? { projectId: null }
        : filters.projectId !== undefined
          ? { projectId: filters.projectId }
          : {}),
    ...(filters.sourceKinds && filters.sourceKinds.length > 0 ? { entityKind: { $in: [...filters.sourceKinds] } } : {}),
  } as never, { orderBy: { updatedAt: "DESC", id: "ASC" }, limit: Math.max(limit * 4, limit) });

  return rows
    .map((row) => toSearchHit(row, normalized))
    .filter((hit) => normalized.length === 0 || hit.score > 0)
    .sort((a, b) => b.score - a.score || b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export async function listSavedSearches(
  em: EntityManager,
  ctx: SearchApplicationContext,
  owner: string,
): Promise<SavedSearch[]> {
  const rows = await em.find(SavedView, {
    org: ctx.orgId,
    viewType: "search",
    createdById: owner,
  } as never, { orderBy: { createdAt: "DESC", id: "ASC" } });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    params: toSearchParams(row.queryJson),
  }));
}

export async function saveSearch(
  em: EntityManager,
  ctx: SearchApplicationContext,
  input: { owner: string; name: string; params: SearchParams },
): Promise<void> {
  const existing = await em.findOne(SavedView, {
    org: ctx.orgId,
    viewType: "search",
    createdById: input.owner,
    name: input.name,
  } as never);
  if (existing) {
    existing.queryJson = paramsToQueryJson(input.params);
    existing.updatedAt = new Date();
    await em.flush();
    return;
  }
  const view = em.create(SavedView, {
    id: randomUUID(),
    org: em.getReference(Org, ctx.orgId),
    name: input.name,
    viewType: "search",
    scope: "private",
    createdById: input.owner,
    queryJson: paramsToQueryJson(input.params),
  });
  em.persist(view);
  await em.flush();
}

function toSearchHit(row: SearchDocument, normalizedQuery: string): SearchHit {
  const title = row.title ?? "";
  const body = row.body ?? "";
  const haystack = `${title}\n${body}`.toLowerCase();
  return {
    id: row.id,
    source_kind: row.entityKind,
    source_id: row.entityId,
    title,
    body,
    score: normalizedQuery.length === 0 ? 1 : score(haystack, normalizedQuery),
    updated_at: (row.updatedAt ?? new Date(0)).toISOString(),
    projectId: row.projectId ?? null,
    scope: row.projectId ? "project" : "global",
    provenance: {
      entityKind: row.entityKind,
      entityId: row.entityId,
      projectId: row.projectId ?? null,
    },
    linkedCounts: linkedCounts(row.metadata),
  };
}

function linkedCounts(metadata: Record<string, unknown> | undefined): SearchHit["linkedCounts"] {
  const raw = metadata?.["linkedCounts"];
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return {
    docs: numericCount(input["docs"]),
    runs: numericCount(input["runs"]),
    artifacts: numericCount(input["artifacts"]),
    memory: numericCount(input["memory"]),
    audit: numericCount(input["audit"]),
  };
}

function numericCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function score(haystack: string, query: string): number {
  if (haystack.includes(query)) return 1;
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;
  return terms.filter((term) => haystack.includes(term)).length / terms.length;
}

function toSearchParams(value: unknown): SearchParams {
  const input = value as Partial<SearchParams> & { text?: string; filters?: Record<string, unknown> };
  const filters = input.filters ?? {};
  return {
    q: String(input.q ?? input.text ?? ""),
    kinds: Array.isArray(input.kinds) ? input.kinds.map(String) : Array.isArray(filters["kinds"]) ? (filters["kinds"] as unknown[]).map(String) : [],
    dateFrom: String(input.dateFrom ?? filters["dateFrom"] ?? ""),
    dateTo: String(input.dateTo ?? filters["dateTo"] ?? ""),
  };
}

function paramsToQueryJson(params: SearchParams): SavedViewQuery {
  return {
    text: params.q,
    filters: [
      ...(params.kinds.length > 0 ? [{ field: "kind", op: "in" as const, value: params.kinds }] : []),
      ...(params.dateFrom ? [{ field: "updated_at", op: "gt" as const, value: params.dateFrom }] : []),
      ...(params.dateTo ? [{ field: "updated_at", op: "lt" as const, value: params.dateTo }] : []),
    ],
    facets: {},
  };
}
