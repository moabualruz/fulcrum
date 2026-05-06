/**
 * P13#05 — REST routes for the sprints domain.
 * Runtime application routes are mounted when deps are present; this file keeps static OpenAPI generation deterministic.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

// ── Schemas ──────────────────────────────────────────────────────────────────

const SprintStatusSchema = z
  .enum(["planning", "active", "completed", "cancelled"])
  .openapi("SprintStatus");

const SprintSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    name: z.string(),
    status: SprintStatusSchema,
    createdAt: z.string().datetime(),
  })
  .openapi("Sprint");

const CreateSprintBodySchema = z
  .object({
    orgId: z.string().uuid(),
    name: z.string().min(1),
    status: SprintStatusSchema.default("planning"),
  })
  .openapi("CreateSprintBody");

const PatchSprintBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    status: SprintStatusSchema.optional(),
  })
  .openapi("PatchSprintBody");

const SprintIdParamSchema = z.object({ id: z.string().uuid() });

const ErrorSchema = z
  .object({ error: z.string(), code: z.string() })
  .openapi("RestError");

// ── Static OpenAPI seed data ─────────────────────────────────────────────────

const FIXED_ORG = "11111111-1111-4111-8111-111111111111";

function createFallbackStore(): Map<string, z.infer<typeof SprintSchema>> {
  return new Map([
    [
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        orgId: FIXED_ORG,
        name: "Seed sprint",
        status: "planning" as const,
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
  path: "/sprints",
  tags: ["sprints"],
  summary: "List sprints",
  responses: {
    200: { content: { "application/json": { schema: z.array(SprintSchema) } }, description: "Sprint list" },
  },
});

const createRoute_ = createRoute({
  method: "post",
  path: "/sprints",
  tags: ["sprints"],
  summary: "Create a sprint",
  request: { body: { content: { "application/json": { schema: CreateSprintBodySchema } } } },
  responses: {
    201: { content: { "application/json": { schema: SprintSchema } }, description: "Created sprint" },
  },
});

const getRoute = createRoute({
  method: "get",
  path: "/sprints/{id}",
  tags: ["sprints"],
  summary: "Get a sprint by ID",
  request: { params: SprintIdParamSchema },
  responses: {
    200: { content: { "application/json": { schema: SprintSchema } }, description: "Sprint" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

const patchRoute = createRoute({
  method: "patch",
  path: "/sprints/{id}",
  tags: ["sprints"],
  summary: "Update a sprint",
  request: {
    params: SprintIdParamSchema,
    body: { content: { "application/json": { schema: PatchSprintBodySchema } } },
  },
  responses: {
    200: { content: { "application/json": { schema: SprintSchema } }, description: "Updated sprint" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/sprints/{id}",
  tags: ["sprints"],
  summary: "Delete a sprint",
  request: { params: SprintIdParamSchema },
  responses: {
    204: { description: "Deleted" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

export function registerSprintRoutes(api: OpenAPIHono): void {
  const store = createFallbackStore();

  api.openapi(listRoute, (c) => {
    return c.json([...store.values()], 200);
  });

  api.openapi(createRoute_, async (c) => {
    const body = c.req.valid("json");
    const sprint: z.infer<typeof SprintSchema> = {
      id: crypto.randomUUID(),
      orgId: body.orgId,
      name: body.name,
      status: body.status,
      createdAt: new Date().toISOString(),
    };
    store.set(sprint.id, sprint);
    return c.json(sprint, 201);
  });

  api.openapi(getRoute, (c) => {
    const { id } = c.req.valid("param");
    const sprint = store.get(id);
    if (!sprint) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return c.json(sprint, 200);
  });

  api.openapi(patchRoute, async (c) => {
    const { id } = c.req.valid("param");
    const sprint = store.get(id);
    if (!sprint) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    const patch = c.req.valid("json");
    const updated = { ...sprint, ...patch };
    store.set(id, updated);
    return c.json(updated, 200);
  });

  api.openapi(deleteRoute, (c) => {
    const { id } = c.req.valid("param");
    const sprint = store.get(id);
    if (!sprint) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    store.delete(id);
    return new Response(null, { status: 204 });
  });
}
