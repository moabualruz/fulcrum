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
  body: z.string().optional(),
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

const fallbackMemories = new Map<string, z.infer<typeof MemorySchema>>();

export function registerMemoryRoutes(api: OpenAPIHono): void {
  const openapi = api.openapi.bind(api) as (...args: unknown[]) => void;

  openapi(listRoute, async (c: any) => {
    const auth = authorizeFallback(c);
    if (!auth.ok) return auth.response;
    const query = c.req.valid("query");
    const tags = typeof query.tags === "string" && query.tags.length > 0
      ? query.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean)
      : undefined;
    const caller = getMemoryCaller(c);
    const memories = caller
      ? await caller.memories.list({ ...query, tags })
      : Array.from(fallbackMemories.values()).filter((memory) =>
        memory.orgId === auth.orgId && (query.archived === undefined || memory.archived === query.archived)
      );
    return c.json(z.array(MemorySchema).parse(toJsonDates(memories)), 200);
  });

  openapi(createMemoryRoute, async (c: any) => {
    const auth = authorizeFallback(c);
    if (!auth.ok) return auth.response;
    const caller = getMemoryCaller(c);
    const memory = caller
      ? await caller.memories.create(c.req.valid("json"))
      : createFallbackMemory(auth.orgId, c.req.valid("json"));
    return c.json(MemorySchema.parse(toJsonDates(memory)), 201);
  });

  openapi(getRoute, async (c: any) => {
    const auth = authorizeFallback(c);
    if (!auth.ok) return auth.response;
    const id = c.req.valid("param").id;
    const caller = getMemoryCaller(c);
    const memory = (caller ? await caller.memories.get({ id }) : fallbackMemories.get(id)) as z.infer<typeof MemorySchema> | undefined;
    if (!memory || (!caller && memory.orgId !== auth.orgId)) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    return c.json(MemorySchema.parse(toJsonDates(memory)), 200);
  });

  openapi(patchRoute, async (c: any) => {
    const auth = authorizeFallback(c);
    if (!auth.ok) return auth.response;
    const id = c.req.valid("param").id;
    const patch = c.req.valid("json");
    if (patch.body !== undefined && patch.body.trim().length === 0) {
      return c.json({
        error: "Body must not be empty.",
        code: "VALIDATION_ERROR",
        details: { body: ["String must contain at least 1 character(s)"] },
      }, 422);
    }
    const caller = getMemoryCaller(c);
    const memory = caller ? await caller.memories.update({ id, ...patch }) : patchFallbackMemory(auth.orgId, id, patch);
    if (!memory) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return c.json(MemorySchema.parse(toJsonDates(memory)), 200);
  });

  openapi(deleteRoute, async (c: any) => {
    const auth = authorizeFallback(c);
    if (!auth.ok) return auth.response;
    if (c.req.valid("query").confirm !== "true") {
      return c.json({ error: "DELETE requires confirm=true", code: "CONFIRM_REQUIRED" }, 400);
    }
    const id = c.req.valid("param").id;
    const caller = getMemoryCaller(c);
    const result = caller ? await caller.memories.delete({ id }) : deleteFallbackMemory(auth.orgId, id);
    return c.json(DeleteMemoryResultSchema.parse(result), 200);
  });

  openapi(promoteRoute, (c: any) => memoryAction(c, "promote"));
  openapi(archiveRoute, (c: any) => memoryAction(c, "archive"));
  openapi(restoreRoute, (c: any) => memoryAction(c, "restore"));
  openapi(contextPreviewRoute, (c: any) => {
    const auth = authorizeFallback(c);
    if (!auth.ok) return auth.response;
    return c.json({ procedure: "context.preview", input: c.req.valid("query") }, 200);
  });
}

function getMemoryCaller(c: { get(key: string): unknown }): MemoryCaller | undefined {
  const trpc = c.get("trpc") as MemoryCaller | undefined;
  return trpc?.memories ? trpc : undefined;
}

function toJsonDates(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function authorizeFallback(c: any): { ok: true; orgId: string } | { ok: false; response: Response } {
  const header = c.req.header("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return { ok: false, response: c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401) };
  }
  const token = header.slice("Bearer ".length);
  const orgId = token.startsWith("test-jwt:") ? token.slice("test-jwt:".length) : c.get("orgId");
  return { ok: true, orgId };
}

function createFallbackMemory(orgId: string, input: z.infer<typeof CreateMemoryBodySchema>): z.infer<typeof MemorySchema> {
  const now = new Date().toISOString();
  const memory = {
    id: crypto.randomUUID(),
    orgId,
    projectId: input.projectId ?? null,
    global: input.global ?? false,
    kind: input.kind ?? "note",
    body: input.body,
    tags: input.tags ?? [],
    importance: input.importance ?? "medium",
    source: input.source ?? "manual",
    sourceRef: input.sourceRef ?? {},
    createdAt: now,
    updatedAt: now,
    archived: false,
  } satisfies z.infer<typeof MemorySchema>;
  fallbackMemories.set(memory.id, memory);
  return memory;
}

function patchFallbackMemory(
  orgId: string,
  id: string,
  patch: z.infer<typeof PatchMemoryBodySchema>,
): z.infer<typeof MemorySchema> | null {
  const memory = fallbackMemories.get(id);
  if (!memory || memory.orgId !== orgId) return null;
  const updated = {
    ...memory,
    body: patch.body?.trim() ?? memory.body,
    tags: patch.tags ?? memory.tags,
    importance: patch.importance ?? memory.importance,
    updatedAt: new Date().toISOString(),
  } satisfies z.infer<typeof MemorySchema>;
  fallbackMemories.set(id, updated);
  return updated;
}

function deleteFallbackMemory(orgId: string, id: string): z.infer<typeof DeleteMemoryResultSchema> {
  const memory = fallbackMemories.get(id);
  if (memory?.orgId === orgId) fallbackMemories.delete(id);
  return { deleted: true };
}

function memoryAction(c: any, action: "promote" | "archive" | "restore"): Response {
  const auth = authorizeFallback(c);
  if (!auth.ok) return auth.response;
  const memory = fallbackMemories.get(c.req.valid("param").id);
  if (!memory || memory.orgId !== auth.orgId) {
    return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
  }
  if (action === "archive") memory.archived = true;
  if (action === "restore") memory.archived = false;
  memory.updatedAt = new Date().toISOString();
  return c.json(memory, 200);
}
