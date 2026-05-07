/**
 * P13#05 — REST routes for the saved-views domain.
 * Runtime routes require an injected saved-views facade.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { appErrorToHttpResponse } from "@/application/error-mapping.ts";
import { AppInvariantError } from "@/application/errors.ts";

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

type SavedViewsFacade = {
  list(input?: unknown): Promise<unknown>;
  create(input: unknown): Promise<unknown>;
  delete(input: unknown): Promise<unknown>;
};

export function registerSavedViewRoutes(api: OpenAPIHono): void {
  api.openapi(listRoute, async (c) => {
    const facade = getSavedViewsFacade(c);
    if (!facade) return applicationRequired(c);
    const views = await facade.list({});
    return c.json(z.array(SavedViewSchema).parse(toJsonDates(views)), 200);
  });

  api.openapi(createRoute_, async (c) => {
    const body = c.req.valid("json");
    const facade = getSavedViewsFacade(c);
    if (!facade) return applicationRequired(c);
    const view = await facade.create(body);
    return c.json(SavedViewSchema.parse(toJsonDates(view)), 201);
  });

  api.openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid("param");
    const facade = getSavedViewsFacade(c);
    if (!facade) return applicationRequired(c);
    const view = await facade.delete({ id });
    if (!view) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return new Response(null, { status: 204 }) as any;
  });
}

function getSavedViewsFacade(c: any): SavedViewsFacade | undefined {
  const application = c.get("application") as { savedViews?: SavedViewsFacade } | undefined;
  return application?.savedViews;
}

function toJsonDates(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function applicationRequired(c: any): any {
  const mapped = appErrorToHttpResponse(new AppInvariantError("Application-backed REST saved-views route is required."));
  return c.json(mapped.body, mapped.status as never);
}
