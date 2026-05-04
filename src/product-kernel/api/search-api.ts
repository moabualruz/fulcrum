/**
 * Public API search endpoints — Hono + @hono/zod-openapi wrapper.
 * Gated by FULCRUM_FEATURES=public-api (flag OFF → 404).
 * Per Q28: thin wrapper, no duplicated business logic.
 */
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ProductDb } from "../db/types.ts";
import { searchProductDocuments } from "../search.ts";
import { suggestTitles } from "../suggest.ts";
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
} from "../saved-searches.ts";
import { isFeatureEnabled } from "../features.ts";

// --- Zod schemas for OpenAPI ---

const SearchHitSchema = z
  .object({
    id: z.string(),
    source_kind: z.string(),
    source_id: z.string(),
    title: z.string(),
    body: z.string(),
    score: z.number(),
    updated_at: z.string(),
  })
  .openapi("SearchHit");

const SearchQuerySchema = z.object({
  q: z.string().min(1).openapi({ description: "Search query string" }),
  org_id: z.string().openapi({ description: "Organization ID" }),
  project_id: z.string().optional().openapi({ description: "Project ID filter" }),
  kind: z.string().optional().openapi({ description: "Source kind filter (comma-separated)" }),
  limit: z.coerce.number().int().min(1).max(100).optional().openapi({ description: "Max results" }),
});

const SuggestQuerySchema = z.object({
  prefix: z.string().min(1).openapi({ description: "Prefix to autocomplete" }),
  org_id: z.string().openapi({ description: "Organization ID" }),
  kind: z.string().optional().openapi({ description: "Source kind filter" }),
});

const SavedSearchSchema = z
  .object({
    id: z.string(),
    org_id: z.string(),
    user_id: z.string(),
    name: z.string(),
    query_json: z.string(),
    scope: z.enum(["private", "project", "org"]),
    project_id: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .openapi("SavedSearch");

const CreateSavedSearchBody = z
  .object({
    org_id: z.string(),
    user_id: z.string(),
    name: z.string().min(1),
    query_json: z.record(z.string(), z.unknown()),
    scope: z.enum(["private", "project", "org"]),
    project_id: z.string().optional(),
  })
  .openapi("CreateSavedSearchInput");

const ErrorSchema = z
  .object({
    error: z.string(),
  })
  .openapi("Error");

// --- Routes ---

const searchRoute = createRoute({
  method: "get",
  path: "/api/v1/search",
  tags: ["Search"],
  summary: "Full-text search",
  request: { query: SearchQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(SearchHitSchema) } },
      description: "Search results",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Bad request",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Unauthorized",
    },
  },
});

const suggestRoute = createRoute({
  method: "get",
  path: "/api/v1/search/suggest",
  tags: ["Search"],
  summary: "Title autocomplete",
  request: { query: SuggestQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ suggestions: z.array(z.string()) }),
        },
      },
      description: "Suggestions",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Unauthorized",
    },
  },
});

const savedListRoute = createRoute({
  method: "get",
  path: "/api/v1/search/saved",
  tags: ["Saved Searches"],
  summary: "List saved searches",
  request: {
    query: z.object({
      org_id: z.string(),
      user_id: z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": { schema: z.array(SavedSearchSchema) },
      },
      description: "Saved searches",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Unauthorized",
    },
  },
});

const savedCreateRoute = createRoute({
  method: "post",
  path: "/api/v1/search/saved",
  tags: ["Saved Searches"],
  summary: "Create a saved search",
  request: {
    body: {
      content: { "application/json": { schema: CreateSavedSearchBody } },
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: SavedSearchSchema } },
      description: "Created",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Bad request",
    },
    401: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Unauthorized",
    },
  },
});

// --- App factory ---

export interface SearchApiDeps {
  db: ProductDb;
  /** Override for testing; defaults to process.env.FULCRUM_FEATURES */
  featuresEnv?: string;
  /**
   * Auth check — return user ID if valid, null if unauthorized.
   * In production: verify Bearer JWT or API key.
   * Tests can supply a stub.
   */
  authenticate: (authHeader: string | undefined) => Promise<string | null>;
}

export function createSearchApi(deps: SearchApiDeps): OpenAPIHono {
  const app = new OpenAPIHono();

  // Feature-flag gate: 404 when public-api not enabled
  app.use("/api/v1/search/*", async (c, next) => {
    const env = deps.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      return c.json({ error: "not found" }, 404);
    }
    await next();
  });
  // Also gate the exact /api/v1/search path (no trailing)
  app.use("/api/v1/search", async (c, next) => {
    const env = deps.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      return c.json({ error: "not found" }, 404);
    }
    await next();
  });

  // Auth middleware
  app.use("/api/v1/*", async (c, next) => {
    const userId = await deps.authenticate(c.req.header("authorization"));
    if (!userId) {
      return c.json({ error: "unauthorized" }, 401);
    }
    (c as { set(key: string, value: string): void }).set("userId", userId);
    await next();
  });

  // GET /api/v1/search
  app.openapi(searchRoute, async (c) => {
    const { q, org_id, project_id, kind, limit } = c.req.valid("query");
    const sourceKinds = kind ? kind.split(",").map((k) => k.trim()) : undefined;
    const hits = await searchProductDocuments(deps.db, q, {
      orgId: org_id,
      projectId: project_id,
      sourceKinds,
      limit,
    });
    return c.json(hits, 200);
  });

  // GET /api/v1/search/suggest
  app.openapi(suggestRoute, async (c) => {
    const { prefix, org_id, kind } = c.req.valid("query");
    const suggestions = await suggestTitles(deps.db, prefix, {
      orgId: org_id,
      kind,
    });
    return c.json({ suggestions }, 200);
  });

  // GET /api/v1/search/saved
  app.openapi(savedListRoute, async (c) => {
    const { org_id, user_id } = c.req.valid("query");
    const rows = await listSavedSearches(deps.db, {
      orgId: org_id,
      userId: user_id,
    });
    return c.json(rows, 200);
  });

  // POST /api/v1/search/saved
  app.openapi(savedCreateRoute, async (c) => {
    const body = c.req.valid("json");
    const row = await createSavedSearch(deps.db, {
      orgId: body.org_id,
      userId: body.user_id,
      name: body.name,
      queryJson: body.query_json,
      scope: body.scope,
      projectId: body.project_id,
    });
    return c.json(row, 201);
  });

  // OpenAPI spec endpoint
  app.doc31("/api/openapi.json", {
    openapi: "3.1.0",
    info: { title: "Fulcrum Search API", version: "1.0.0" },
  });

  return app;
}
