/**
 * P13#06 — REST routes for the search domain.
 * Delegates to search.query tRPC procedure (stub store; Pillar 3 replaces).
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

// ── Schemas ──────────────────────────────────────────────────────────────────

const SearchKindSchema = z
  .enum(["task", "doc", "sprint", "run", "artifact"])
  .openapi("SearchKind");

const SearchResultSchema = z
  .object({
    kind: SearchKindSchema,
    id: z.string().uuid(),
    title: z.string(),
    snippet: z.string(),
  })
  .openapi("SearchResult");

const SearchQuerySchema = z.object({
  q: z.string().min(1),
  kind: SearchKindSchema.optional(),
  project: z.string().optional(),
});

// ── Stub data ─────────────────────────────────────────────────────────────────

const STUB_RESULTS: z.infer<typeof SearchResultSchema>[] = [
  {
    kind: "task",
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    title: "Stub task",
    snippet: "This is a stub search result",
  },
  {
    kind: "doc",
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    title: "Stub doc",
    snippet: "Document stub content",
  },
];

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
  api.openapi(searchRoute, (c) => {
    const { q, kind } = c.req.valid("query");
    const lower = q.toLowerCase();
    let results = STUB_RESULTS.filter(
      (r) =>
        r.title.toLowerCase().includes(lower) ||
        r.snippet.toLowerCase().includes(lower),
    );
    if (kind) {
      results = results.filter((r) => r.kind === kind);
    }
    return c.json(results, 200);
  });
}
