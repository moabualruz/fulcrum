/**
 * P13#05 — REST routes for the saved-views domain.
 * Runtime application routes are mounted when deps are present; this file keeps static OpenAPI generation deterministic.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

// ── Schemas ──────────────────────────────────────────────────────────────────

const SavedViewScopeSchema = z
  .enum(["private", "project", "org"])
  .openapi("SavedViewScope");

const SavedViewTypeSchema = z
  .enum(["kanban", "table", "calendar", "timeline", "list"])
  .openapi("SavedViewType");

const SavedViewSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    name: z.string(),
    scope: SavedViewScopeSchema,
    viewType: SavedViewTypeSchema,
    createdAt: z.string().datetime(),
  })
  .openapi("SavedView");

const CreateSavedViewBodySchema = z
  .object({
    orgId: z.string().uuid(),
    name: z.string().min(1),
    scope: SavedViewScopeSchema.default("private"),
    viewType: SavedViewTypeSchema.default("list"),
  })
  .openapi("CreateSavedViewBody");

const ViewIdParamSchema = z.object({ id: z.string().uuid() });

const ErrorSchema = z
  .object({ error: z.string(), code: z.string() })
  .openapi("RestError");

// ── Static OpenAPI seed data ─────────────────────────────────────────────────

const FIXED_ORG = "11111111-1111-4111-8111-111111111111";

function createFallbackStore(): Map<string, z.infer<typeof SavedViewSchema>> {
  return new Map([
    [
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        orgId: FIXED_ORG,
        name: "Seed view",
        scope: "private" as const,
        viewType: "list" as const,
        createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      },
    ],
  ]);
}

function extractOrgId(auth: string | null): string | null {
  if (!auth) return null;
  const token = auth.replace(/^Bearer\s+/, "");
  if (token.startsWith("test-jwt:")) return token.slice("test-jwt:".length);
  return null;
}

// ── Routes ───────────────────────────────────────────────────────────────────

const listRoute = createRoute({
  method: "get",
  path: "/saved-views",
  tags: ["saved-views"],
  summary: "List saved views",
  responses: {
    200: {
      content: { "application/json": { schema: z.array(SavedViewSchema) } },
      description: "SavedView list",
    },
  },
});

const createRoute_ = createRoute({
  method: "post",
  path: "/saved-views",
  tags: ["saved-views"],
  summary: "Create a saved view",
  request: { body: { content: { "application/json": { schema: CreateSavedViewBodySchema } } } },
  responses: {
    201: { content: { "application/json": { schema: SavedViewSchema } }, description: "Created view" },
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/saved-views/{id}",
  tags: ["saved-views"],
  summary: "Delete a saved view",
  request: { params: ViewIdParamSchema },
  responses: {
    204: { description: "Deleted" },
    403: { content: { "application/json": { schema: ErrorSchema } }, description: "Forbidden" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

export function registerSavedViewRoutes(api: OpenAPIHono): void {
  const store = createFallbackStore();

  api.openapi(listRoute, (c) => {
    return c.json([...store.values()], 200);
  });

  api.openapi(createRoute_, async (c) => {
    const body = c.req.valid("json");
    const view: z.infer<typeof SavedViewSchema> = {
      id: crypto.randomUUID(),
      orgId: body.orgId,
      name: body.name,
      scope: body.scope,
      viewType: body.viewType,
      createdAt: new Date().toISOString(),
    };
    store.set(view.id, view);
    return c.json(view, 201);
  });

  api.openapi(deleteRoute, (c) => {
    const { id } = c.req.valid("param");
    const callerOrg = extractOrgId(c.req.header("Authorization") ?? null);
    const view = store.get(id);
    if (!view) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    if (callerOrg !== view.orgId) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
    store.delete(id);
    return new Response(null, { status: 204 });
  });
}
