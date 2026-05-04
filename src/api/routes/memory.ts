import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context } from "hono";

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
  global: z.string().optional(),
  kind: MemoryKindSchema.optional(),
  tags: z.string().optional(),
  importance: MemoryImportanceSchema.optional(),
  archived: z.string().optional(),
  source: MemorySourceSchema.optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

const MemoryIdParamSchema = z.object({ id: z.string().uuid() });
const DeleteQuerySchema = z.object({ confirm: z.string().optional() });
const ContextPreviewQuerySchema = z.object({
  taskId: z.string().min(1),
  budget: z.string().optional(),
});

const ErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
  details: z.unknown().optional(),
}).openapi("MemoryRestError");

const DeleteMemoryResultSchema = z.object({ deleted: z.literal(true) }).openapi("DeleteMemoryResult");
const ContextPreviewSchema = z.object({
  procedure: z.literal("context.preview"),
  input: z.object({
    taskId: z.string(),
    budget: z.number().int().positive().optional(),
  }),
  bundle: z.object({
    taskId: z.string(),
    tokenBudget: z.number().int(),
    tokenCount: z.number().int(),
    slices: z.record(z.string(), z.object({
      content: z.string(),
      tokenCount: z.number().int(),
    })),
  }),
}).openapi("ContextPreview");

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
    body: { content: { "application/json": { schema: z.unknown() } } },
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

function actionRoute(path: "/memory/{id}/promote" | "/memory/{id}/archive" | "/memory/{id}/restore", summary: string) {
  return createRoute({
    method: "post",
    path,
    tags: ["memory"],
    summary,
    request: { params: MemoryIdParamSchema },
    responses: {
      200: { content: { "application/json": { schema: MemorySchema } }, description: "Updated memory" },
      401: { content: { "application/json": { schema: ErrorSchema } }, description: "Unauthorized" },
      404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
    },
  });
}

const promoteRoute = actionRoute("/memory/{id}/promote", "Promote a memory");
const archiveRoute = actionRoute("/memory/{id}/archive", "Archive a memory");
const restoreRoute = actionRoute("/memory/{id}/restore", "Restore a memory");

const contextPreviewRoute = createRoute({
  method: "get",
  path: "/context/preview",
  tags: ["context"],
  summary: "Preview assembled context for a task",
  request: { query: ContextPreviewQuerySchema },
  responses: {
    200: { content: { "application/json": { schema: ContextPreviewSchema } }, description: "Context preview" },
    401: { content: { "application/json": { schema: ErrorSchema } }, description: "Unauthorized" },
  },
});

type MemoryRow = z.infer<typeof MemorySchema>;
type RouteContext = Context & {
  req: Context["req"] & {
    valid(target: "json" | "param" | "query"): any;
  };
};

function extractOrgId(auth: string | null): string | null {
  if (!auth) return null;
  const token = auth.replace(/^Bearer\s+/, "");
  if (token.startsWith("test-jwt:")) return token.slice("test-jwt:".length);
  return null;
}

function authOrg(c: Context): string | Response {
  const orgId = extractOrgId(c.req.header("Authorization") ?? null);
  if (!orgId) {
    return c.json({ error: "Authentication required", code: "UNAUTHORIZED" }, 401);
  }
  return orgId;
}

function makeMemory(input: z.infer<typeof CreateMemoryBodySchema>, orgId: string): MemoryRow {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    orgId,
    projectId: input.projectId ?? null,
    global: input.global ?? false,
    kind: input.kind ?? "note",
    body: input.body,
    tags: input.tags ?? [],
    importance: input.importance ?? "medium",
    source: "manual",
    sourceRef: input.sourceRef ?? {},
    createdAt: now,
    updatedAt: now,
    archived: false,
  };
}

function byCallerOrg(store: Map<string, MemoryRow>, orgId: string): MemoryRow[] {
  return [...store.values()].filter((memory) => memory.orgId === orgId);
}

function findForCaller(store: Map<string, MemoryRow>, id: string, orgId: string): MemoryRow | null {
  const memory = store.get(id);
  return memory?.orgId === orgId ? memory : null;
}

export function registerMemoryRoutes(api: OpenAPIHono): void {
  const store = new Map<string, MemoryRow>();
  // Hono's typed-response union is narrower than shared error responders.
  const openapi = api.openapi.bind(api) as (...args: unknown[]) => void;

  openapi(listRoute, (c: RouteContext) => {
    const orgId = authOrg(c);
    if (orgId instanceof Response) return orgId;
    return c.json(byCallerOrg(store, orgId), 200);
  });

  openapi(createMemoryRoute, (c: RouteContext) => {
    const orgId = authOrg(c);
    if (orgId instanceof Response) return orgId;
    const memory = makeMemory(c.req.valid("json"), orgId);
    store.set(memory.id, memory);
    return c.json(memory, 201);
  });

  openapi(getRoute, (c: RouteContext) => {
    const orgId = authOrg(c);
    if (orgId instanceof Response) return orgId;
    const memory = findForCaller(store, c.req.valid("param").id, orgId);
    if (!memory) return c.json({ error: "Memory not found", code: "NOT_FOUND" }, 404);
    return c.json(memory, 200);
  });

  openapi(patchRoute, async (c: RouteContext) => {
    const orgId = authOrg(c);
    if (orgId instanceof Response) return orgId;
    const memory = findForCaller(store, c.req.valid("param").id, orgId);
    if (!memory) return c.json({ error: "Memory not found", code: "NOT_FOUND" }, 404);

    const parsed = PatchMemoryBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({
        error: "Validation failed",
        code: "VALIDATION_ERROR",
        details: z.treeifyError(parsed.error),
      }, 422);
    }

    Object.assign(memory, {
      ...("body" in parsed.data ? { body: parsed.data.body } : {}),
      ...("tags" in parsed.data ? { tags: parsed.data.tags } : {}),
      ...("importance" in parsed.data ? { importance: parsed.data.importance } : {}),
      updatedAt: new Date().toISOString(),
    });
    return c.json(memory, 200);
  });

  openapi(deleteRoute, (c: RouteContext) => {
    const orgId = authOrg(c);
    if (orgId instanceof Response) return orgId;
    const { id } = c.req.valid("param");
    if (c.req.valid("query").confirm !== "true") {
      return c.json({ error: "DELETE requires confirm=true", code: "CONFIRM_REQUIRED" }, 400);
    }
    const memory = findForCaller(store, id, orgId);
    if (!memory) return c.json({ error: "Memory not found", code: "NOT_FOUND" }, 404);
    store.delete(id);
    return c.json({ deleted: true as const }, 200);
  });

  openapi(promoteRoute, (c: RouteContext) => {
    const orgId = authOrg(c);
    if (orgId instanceof Response) return orgId;
    const memory = findForCaller(store, c.req.valid("param").id, orgId);
    if (!memory) return c.json({ error: "Memory not found", code: "NOT_FOUND" }, 404);
    memory.global = true;
    memory.importance = "high";
    memory.updatedAt = new Date().toISOString();
    return c.json(memory, 200);
  });

  openapi(archiveRoute, (c: RouteContext) => {
    const orgId = authOrg(c);
    if (orgId instanceof Response) return orgId;
    const memory = findForCaller(store, c.req.valid("param").id, orgId);
    if (!memory) return c.json({ error: "Memory not found", code: "NOT_FOUND" }, 404);
    memory.archived = true;
    memory.updatedAt = new Date().toISOString();
    return c.json(memory, 200);
  });

  openapi(restoreRoute, (c: RouteContext) => {
    const orgId = authOrg(c);
    if (orgId instanceof Response) return orgId;
    const memory = findForCaller(store, c.req.valid("param").id, orgId);
    if (!memory) return c.json({ error: "Memory not found", code: "NOT_FOUND" }, 404);
    memory.archived = false;
    memory.updatedAt = new Date().toISOString();
    return c.json(memory, 200);
  });

  openapi(contextPreviewRoute, (c: RouteContext) => {
    const orgId = authOrg(c);
    if (orgId instanceof Response) return orgId;
    const { taskId, budget } = c.req.valid("query");
    const tokenBudget = budget ? Number.parseInt(budget, 10) : 8192;
    return c.json({
      procedure: "context.preview" as const,
      input: { taskId, ...(budget ? { budget: tokenBudget } : {}) },
      bundle: {
        taskId,
        tokenBudget,
        tokenCount: 0,
        slices: {
          memories: { content: "", tokenCount: 0 },
          linkedDocs: { content: "", tokenCount: 0 },
          recentRuns: { content: "", tokenCount: 0 },
          repoState: { content: "", tokenCount: 0 },
          skillPrompts: { content: "", tokenCount: 0 },
        },
      },
    }, 200);
  });
}
