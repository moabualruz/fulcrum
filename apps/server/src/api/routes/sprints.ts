/**
 * P13#05 — REST routes for the sprints domain.
 * Runtime sprint routes are mounted from the application-backed kernel adapter when deps are present.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { appErrorToHttpResponse } from "@/application/error-mapping.ts";
import { AppInvariantError } from "@/application/errors.ts";

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
  api.openapi(listRoute, (c) => {
    return applicationRequired(c);
  });

  api.openapi(createRoute_, (c) => {
    return applicationRequired(c);
  });

  api.openapi(getRoute, (c) => {
    return applicationRequired(c);
  });

  api.openapi(patchRoute, (c) => {
    return applicationRequired(c);
  });

  api.openapi(deleteRoute, (c) => {
    return applicationRequired(c);
  });
}

function applicationRequired(c: any): any {
  const mapped = appErrorToHttpResponse(new AppInvariantError("Application-backed REST sprint route is required."));
  return c.json(mapped.body, mapped.status as never);
}
