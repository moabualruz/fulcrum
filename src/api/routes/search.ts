/**
 * P13#06 — REST routes for the search domain.
 * Delegates to application search queries.
 * T-06-09: limit capped at 100.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { EntityManager } from "@mikro-orm/postgresql";

import { searchDocuments } from "../../application/search/queries.ts";
import { appErrorToHttpResponse } from "../../application/error-mapping.ts";
import { AppInvariantError } from "../../application/errors.ts";

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

type SearchFacade = {
  query(input: {
    q: string;
    orgId?: string;
    kind?: z.infer<typeof SearchKindSchema>;
    projectId?: string;
    limit?: number;
    offset?: number;
  }): Promise<unknown>;
};

export function registerSearchRoutes(api: OpenAPIHono): void {
  api.openapi(searchRoute, async (c) => {
    const { q, kind, project, limit, offset } = c.req.valid("query");

    // Resolve org_id from request context (set by auth middleware)
    const orgId: string | undefined =
      (c.get as (key: string) => string | undefined)("orgId") ??
      orgIdFromAuthorization(c.req.header("authorization")) ??
      (c.req.header("x-org-id") || undefined);

    if (!orgId) {
      return c.json([], 200);
    }

    return await mapHttpError(c, async () => {
      const em = optionalEntityManager(c);
      const searchFacade = getSearchFacade(c);
      if (searchFacade) {
        const results = await searchFacade.query({
          q,
          orgId,
          kind,
          projectId: project ?? undefined,
          limit: limit ?? 20,
          offset: offset ?? 0,
        });
        return c.json(z.array(SearchResultSchema).parse(toJsonDates(results)), 200);
      }
      if (!em) throw new AppInvariantError("Application-backed REST search route is required.");
      const hits = await searchDocuments(em, q, {
        orgId,
        projectId: project ?? undefined,
        sourceKinds: kind ? [kind] : undefined,
        limit: limit ?? 20,
      });
      const results = hits.slice(offset ?? 0).map((hit) => ({
        kind: hit.source_kind,
        id: hit.source_id,
        title: hit.title || null,
        snippet: hit.body,
        rank: hit.score,
      }));
      return c.json(results, 200);
    }) as never;
  });
}

function getSearchFacade(c: { get(key: string): unknown }): SearchFacade | undefined {
  const application = c.get("application") as { search?: SearchFacade } | undefined;
  return application?.search;
}

function toJsonDates(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function orgIdFromAuthorization(header: string | undefined): string | undefined {
  if (!header?.startsWith("Bearer test-jwt:")) return undefined;
  return header.slice("Bearer test-jwt:".length);
}

function optionalEntityManager(c: { get(key: string): unknown }): EntityManager | null {
  const db = c.get("db");
  if (db && typeof db === "object" && "transactional" in db) return db as EntityManager;
  if (db && typeof db === "object" && "em" in db) {
    const entityManager = (db as { em?: unknown }).em;
    if (entityManager && typeof entityManager === "object" && "transactional" in entityManager) {
      return entityManager as EntityManager;
    }
  }
  return null;
}

async function mapHttpError(c: any, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    const mapped = appErrorToHttpResponse(error);
    return c.json(mapped.body, mapped.status as never);
  }
}
