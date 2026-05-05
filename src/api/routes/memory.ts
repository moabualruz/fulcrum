import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

const MemoryKindSchema = z.enum([
  "note",
  "decision",
  "blocker",
  "file_ref",
  "section_anchor",
  "link",
  "fact",
]).openapi("MemoryKind");

const MemoryImportanceSchema = z.enum(["low", "medium", "high"]).openapi("MemoryImportance");
const MemorySourceSchema = z.enum(["heuristic", "llm", "manual"]).openapi("MemorySource");

const MemorySchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  global: z.boolean(),
  kind: MemoryKindSchema,
  body: z.string(),
  tags: z.array(z.string()),
  importance: MemoryImportanceSchema,
  source: MemorySourceSchema,
  sourceRef: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archived: z.boolean(),
}).openapi("Memory");

const CreateMemoryBodySchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  global: z.boolean().optional(),
  kind: MemoryKindSchema.optional(),
  body: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).max(50).optional(),
  importance: MemoryImportanceSchema.optional(),
  source: z.literal("manual").optional(),
  sourceRef: z.record(z.string(), z.unknown()).optional(),
}).strict().openapi("CreateMemoryBody");

const PatchMemoryBodySchema = z.object({
  body: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).max(50).optional(),
  importance: MemoryImportanceSchema.optional(),
  forceEdit: z.boolean().optional(),
}).strict().openapi("PatchMemoryBody");

const MemoryListQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  global: z.coerce.boolean().optional(),
  kind: MemoryKindSchema.optional(),
  tags: z.string().optional(),
  importance: MemoryImportanceSchema.optional(),
  archived: z.coerce.boolean().optional(),
  source: MemorySourceSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

const MemoryIdParamSchema = z.object({ id: z.string().uuid() });
const DeleteQuerySchema = z.object({ confirm: z.string().optional() });
const ContextPreviewQuerySchema = z.object({
  taskId: z.string().min(1),
  budget: z.coerce.number().int().positive().optional(),
});

const ErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.unknown().optional(),
}).openapi("MemoryRestError");

const DeleteMemoryResultSchema = z.object({ deleted: z.literal(true) }).openapi("DeleteMemoryResult");

const listRoute = createRoute({
  method: "get",
  path: "/memory",
  tags: ["memory"],
  summary: "List memories",
  request: { query: MemoryListQuerySchema },
  responses: {
    200: { content: { "application/json": { schema: z.array(MemorySchema) } }, description: "Memory list" },
    401: { content: { "application/json": { schema: ErrorSchema } }, description: "Unauthorized" },
  },
});

const createMemoryRoute = createRoute({
  method: "post",
  path: "/memory",
  tags: ["memory"],
  summary: "Create a memory",
  request: { body: { content: { "application/json": { schema: CreateMemoryBodySchema } } } },
  responses: {
    201: { content: { "application/json": { schema: MemorySchema } }, description: "Created memory" },
    401: { content: { "application/json": { schema: ErrorSchema } }, description: "Unauthorized" },
  },
});

const getRoute = createRoute({
  method: "get",
  path: "/memory/{id}",
  tags: ["memory"],
  summary: "Get a memory",
  request: { params: MemoryIdParamSchema },
  responses: {
    200: { content: { "application/json": { schema: MemorySchema } }, description: "Memory" },
    401: { content: { "application/json": { schema: ErrorSchema } }, description: "Unauthorized" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

const patchRoute = createRoute({
  method: "patch",
  path: "/memory/{id}",
  tags: ["memory"],
  summary: "Update a memory",
  request: {
    params: MemoryIdParamSchema,
    body: { content: { "application/json": { schema: PatchMemoryBodySchema } } },
  },
  responses: {
    200: { content: { "application/json": { schema: MemorySchema } }, description: "Updated memory" },
    401: { content: { "application/json": { schema: ErrorSchema } }, description: "Unauthorized" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
    422: { content: { "application/json": { schema: ErrorSchema } }, description: "Invalid input" },
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/memory/{id}",
  tags: ["memory"],
  summary: "Forget a memory",
  request: { params: MemoryIdParamSchema, query: DeleteQuerySchema },
  responses: {
    200: { content: { "application/json": { schema: DeleteMemoryResultSchema } }, description: "Deleted" },
    400: { content: { "application/json": { schema: ErrorSchema } }, description: "Confirmation required" },
    401: { content: { "application/json": { schema: ErrorSchema } }, description: "Unauthorized" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

function unsupportedActionRoute(path: "/memory/{id}/promote" | "/memory/{id}/archive" | "/memory/{id}/restore", summary: string) {
  return createRoute({
    method: "post",
    path,
    tags: ["memory"],
    summary,
    request: { params: MemoryIdParamSchema },
    responses: {
      501: { content: { "application/json": { schema: ErrorSchema } }, description: "Operation unavailable" },
    },
  });
}

const promoteRoute = unsupportedActionRoute("/memory/{id}/promote", "Promote a memory");
const archiveRoute = unsupportedActionRoute("/memory/{id}/archive", "Archive a memory");
const restoreRoute = unsupportedActionRoute("/memory/{id}/restore", "Restore a memory");

const contextPreviewRoute = createRoute({
  method: "get",
  path: "/context/preview",
  tags: ["context"],
  summary: "Preview assembled context for a task",
  request: { query: ContextPreviewQuerySchema },
  responses: {
    501: { content: { "application/json": { schema: ErrorSchema } }, description: "Operation unavailable" },
  },
});

type MemoryCaller = {
  memories: {
    list(input: unknown): Promise<unknown>;
    create(input: unknown): Promise<unknown>;
    get(input: unknown): Promise<unknown>;
    update(input: unknown): Promise<unknown>;
    delete(input: unknown): Promise<unknown>;
  };
};

export function registerMemoryRoutes(api: OpenAPIHono): void {
  const openapi = api.openapi.bind(api) as (...args: unknown[]) => void;

  openapi(listRoute, async (c) => {
    const query = c.req.valid("query");
    const tags = typeof query.tags === "string" && query.tags.length > 0
      ? query.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
      : undefined;
    const memories = await getMemoryCaller(c).memories.list({ ...query, tags });
    return c.json(z.array(MemorySchema).parse(toJsonDates(memories)), 200);
  });

  openapi(createMemoryRoute, async (c) => {
    const memory = await getMemoryCaller(c).memories.create(c.req.valid("json"));
    return c.json(MemorySchema.parse(toJsonDates(memory)), 201);
  });

  openapi(getRoute, async (c) => {
    const memory = await getMemoryCaller(c).memories.get({ id: c.req.valid("param").id });
    return c.json(MemorySchema.parse(toJsonDates(memory)), 200);
  });

  openapi(patchRoute, async (c) => {
    const memory = await getMemoryCaller(c).memories.update({
      id: c.req.valid("param").id,
      ...c.req.valid("json"),
    });
    return c.json(MemorySchema.parse(toJsonDates(memory)), 200);
  });

  openapi(deleteRoute, async (c) => {
    if (c.req.valid("query").confirm !== "true") {
      return c.json({ error: "DELETE requires confirm=true", code: "CONFIRM_REQUIRED" }, 400);
    }
    const result = await getMemoryCaller(c).memories.delete({ id: c.req.valid("param").id });
    return c.json(DeleteMemoryResultSchema.parse(result), 200);
  });

  openapi(promoteRoute, (c) => unavailable(c));
  openapi(archiveRoute, (c) => unavailable(c));
  openapi(restoreRoute, (c) => unavailable(c));
  openapi(contextPreviewRoute, (c) => unavailable(c));
}

function getMemoryCaller(c: { get(key: string): unknown }): MemoryCaller {
  const trpc = c.get("trpc") as MemoryCaller | undefined;
  if (!trpc?.memories) {
    throw new Error("Memory routes require a tRPC caller in Hono context.");
  }
  return trpc;
}

function unavailable(c: { json(body: unknown, status: 501): Response }): Response {
  return c.json({
    error: "Operation is not exposed by the current tRPC contract.",
    code: "NOT_IMPLEMENTED",
  }, 501);
}

function toJsonDates(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}
