/**
 * P13#06 — REST routes for the search domain.
 * Delegates to SearchQueryService for real FTS results.
 *
 * T-06-07: org_id filter enforced in SearchQueryService.
 * T-06-08: parameterized queries only.
 * T-06-09: limit capped at 100.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { SearchQueryService } from "../../search/query-service.ts";

// ── Schemas ──────────────────────────────────────────────────────────────────

const SearchKindSchema = z
  .enum(["task", "doc", "sprint", "run", "artifact"])
  .openapi("SearchKind");

const SearchResultSchema = z
  .object({
    kind: z.string(),
    id: z.string(),
    title: z.string().nullable(),
    snippet: z.string(),
    rank: z.number(),
  })
  .openapi("SearchResult");

const SearchQuerySchema = z.object({
  q: z.string().min(1),
  kind: SearchKindSchema.optional(),
  project: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ── Routes ────────────────────────────────────────────────────────────────────

const searchRoute = createRoute({
  method: "get",
  path: "/search",
  tags: ["search"],
  summary: "Search across all resource kinds",
  request: { query: SearchQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(SearchResultSchema) } },
      description: "Search results",
    },
  },
});

export function registerSearchRoutes(api: OpenAPIHono): void {
  api.openapi(searchRoute, async (c) => {
    const { q, kind, project, limit, offset } = c.req.valid("query");

    // Resolve org_id from request context (set by auth middleware)
    const orgId: string | undefined =
      (c.get as (key: string) => string | undefined)("orgId") ??
      (c.req.header("x-org-id") || undefined);

    if (!orgId) {
      return c.json([], 200);
    }

    // Resolve db from context (injected by app setup)
    const db = (c.get as (key: string) => unknown)("db") as
      | import("../../product-kernel/db/types.ts").ProductDb
      | undefined;

    if (!db) {
      return c.json([], 200);
    }

    const svc = new SearchQueryService(db);
    const output = await svc.query(orgId, {
      term: q,
      filters: {
        kinds: kind ? [kind] : undefined,
        projectIds: project ? [project] : undefined,
      },
      limit: limit ?? 20,
      offset: offset ?? 0,
    });

    const results = output.results.map((r) => ({
      kind: r.entityKind,
      id: r.entityId,
      title: r.title,
      snippet: r.snippet,
      rank: r.rank,
    }));

    return c.json(results, 200);
  });
}
