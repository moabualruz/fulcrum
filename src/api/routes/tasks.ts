/**
 * P13#05 — REST routes for the tasks domain.
 *
 * Delegates to the same logic as tRPC tasks.* procedures (public-api gate).
 * Auth: Bearer token format "test-jwt:<orgId>" (real JWT in production).
 * Error mapping: orgId mismatch → 403, unknown ID → 404.
 *
 * WHY spec seed: real ProductDb routes are mounted when runtime deps are present; this route keeps static OpenAPI generation deterministic.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { CsvValidationError, exportTasksCsv, importTasksCsv } from "../../connectors/csv.ts";

// ── Schemas ──────────────────────────────────────────────────────────────────

const TaskStatusSchema = z
  .enum(["backlog", "todo", "in_progress", "in_review", "done", "cancelled"])
  .openapi("TaskStatus");

const TaskSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    externalId: z.string().optional(),
    title: z.string(),
    status: TaskStatusSchema,
    createdAt: z.string().datetime(),
  })
  .openapi("Task");

const CreateTaskBodySchema = z
  .object({
    orgId: z.string().uuid(),
    title: z.string().min(1),
    status: TaskStatusSchema.default("todo"),
  })
  .openapi("CreateTaskBody");

const PatchTaskBodySchema = z
  .object({
    title: z.string().min(1).optional(),
    status: TaskStatusSchema.optional(),
  })
  .openapi("PatchTaskBody");

const TaskIdParamSchema = z.object({ id: z.string().uuid() });

const ErrorSchema = z
  .object({ error: z.string(), code: z.string() })
  .openapi("RestError");

const ImportCsvBodySchema = z
  .object({
    entity: z.literal("tasks"),
    projectId: z.string().uuid(),
    csv: z.string(),
    columnMap: z.record(z.string(), z.string()).optional(),
  })
  .openapi("ImportCsvBody");

const ImportCsvResultSchema = z
  .object({
    created: z.number().int(),
    skipped: z.number().int(),
    errors: z.array(z.object({
      row: z.number().int().optional(),
      message: z.string(),
      code: z.string().optional(),
    })),
  })
  .openapi("ImportCsvResult");

// ── Static OpenAPI seed data ─────────────────────────────────────────────────

const FIXED_ORG = "11111111-1111-4111-8111-111111111111";

/** Factory — each call returns a fresh Map so tests don't share state. */
function createFallbackStore(): Map<string, z.infer<typeof TaskSchema>> {
  return new Map([
    [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        orgId: FIXED_ORG,
        title: "Seed task",
        status: "todo" as const,
        createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      },
    ],
  ]);
}

/** Extract orgId from test JWT; in production a real JWT verifier replaces this. */
function extractOrgId(auth: string | null): string | null {
  if (!auth) return null;
  const token = auth.replace(/^Bearer\s+/, "");
  if (token.startsWith("test-jwt:")) return token.slice("test-jwt:".length);
  return null; // real JWT path: decode + verify
}

function isFeatureEnabled(flag: string): boolean {
  return (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((feature) => feature.trim())
    .includes(flag);
}

// ── Route definitions ────────────────────────────────────────────────────────

const listRoute = createRoute({
  method: "get",
  path: "/tasks",
  tags: ["tasks"],
  summary: "List tasks",
  responses: {
    200: { content: { "application/json": { schema: z.array(TaskSchema) } }, description: "Task list" },
  },
});

const createRoute_ = createRoute({
  method: "post",
  path: "/tasks",
  tags: ["tasks"],
  summary: "Create a task",
  request: { body: { content: { "application/json": { schema: CreateTaskBodySchema } } } },
  responses: {
    201: { content: { "application/json": { schema: TaskSchema } }, description: "Created task" },
  },
});

const getRoute = createRoute({
  method: "get",
  path: "/tasks/{id}",
  tags: ["tasks"],
  summary: "Get a task by ID",
  request: { params: TaskIdParamSchema },
  responses: {
    200: { content: { "application/json": { schema: TaskSchema } }, description: "Task" },
    403: { content: { "application/json": { schema: ErrorSchema } }, description: "Forbidden" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

const patchRoute = createRoute({
  method: "patch",
  path: "/tasks/{id}",
  tags: ["tasks"],
  summary: "Update a task",
  request: {
    params: TaskIdParamSchema,
    body: { content: { "application/json": { schema: PatchTaskBodySchema } } },
  },
  responses: {
    200: { content: { "application/json": { schema: TaskSchema } }, description: "Updated task" },
    403: { content: { "application/json": { schema: ErrorSchema } }, description: "Forbidden" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/tasks/{id}",
  tags: ["tasks"],
  summary: "Delete a task",
  request: { params: TaskIdParamSchema },
  responses: {
    204: { description: "Deleted" },
    403: { content: { "application/json": { schema: ErrorSchema } }, description: "Forbidden" },
    404: { content: { "application/json": { schema: ErrorSchema } }, description: "Not found" },
  },
});

const exportCsvRoute = createRoute({
  method: "get",
  path: "/connectors/export-csv",
  tags: ["connectors"],
  summary: "Export tasks to CSV",
  request: {
    query: z.object({
      entity: z.literal("tasks"),
      projectId: z.string().uuid(),
    }),
  },
  responses: {
    200: { content: { "text/csv": { schema: z.string() } }, description: "Task CSV" },
    403: { content: { "application/json": { schema: ErrorSchema } }, description: "Feature disabled" },
  },
});

const importCsvRoute = createRoute({
  method: "post",
  path: "/connectors/import-csv",
  tags: ["connectors"],
  summary: "Import tasks from CSV",
  request: { body: { content: { "application/json": { schema: ImportCsvBodySchema } } } },
  responses: {
    200: { content: { "application/json": { schema: ImportCsvResultSchema } }, description: "Import result" },
    403: { content: { "application/json": { schema: ErrorSchema } }, description: "Feature disabled" },
    422: { content: { "application/json": { schema: z.object({ error: z.unknown() }) } }, description: "Invalid CSV" },
  },
});

// ── Router factory ───────────────────────────────────────────────────────────

export function registerTaskRoutes(api: OpenAPIHono): void {
  // Fresh store per registration — each createPublicApi() call is isolated.
  const store = createFallbackStore();

  api.openapi(listRoute, (c) => {
    return c.json([...store.values()], 200);
  });

  api.openapi(createRoute_, async (c) => {
    const body = c.req.valid("json");
    const task: z.infer<typeof TaskSchema> = {
      id: crypto.randomUUID(),
      orgId: body.orgId,
      title: body.title,
      status: body.status,
      createdAt: new Date().toISOString(),
    };
    store.set(task.id, task);
    return c.json(task, 201);
  });

  api.openapi(getRoute, (c) => {
    const { id } = c.req.valid("param");
    const callerOrg = extractOrgId(c.req.header("Authorization") ?? null);
    const task = store.get(id);
    if (!task) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    if (callerOrg !== task.orgId) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
    return c.json(task, 200);
  });

  api.openapi(patchRoute, async (c) => {
    const { id } = c.req.valid("param");
    const callerOrg = extractOrgId(c.req.header("Authorization") ?? null);
    const task = store.get(id);
    if (!task) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    if (callerOrg !== task.orgId) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
    const patch = c.req.valid("json");
    const updated = { ...task, ...patch };
    store.set(id, updated);
    return c.json(updated, 200);
  });

  api.openapi(deleteRoute, (c) => {
    const { id } = c.req.valid("param");
    const callerOrg = extractOrgId(c.req.header("Authorization") ?? null);
    const task = store.get(id);
    if (!task) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    if (callerOrg !== task.orgId) return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
    store.delete(id);
    return new Response(null, { status: 204 });
  });

  api.openapi(exportCsvRoute, (c) => {
    if (!isFeatureEnabled("export-csv")) {
      return c.json({ error: "Feature disabled", code: "FEATURE_DISABLED" }, 403);
    }

    const { projectId } = c.req.valid("query");
    const csv = exportTasksCsv(
      [...store.values()]
        .filter((task) => task.orgId === projectId)
        .map((task) => ({
          id: task.id,
          externalId: task.externalId,
          title: task.title,
          status: task.status,
          createdAt: task.createdAt,
        })),
    );

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"tasks.csv\"",
      },
    });
  });

  api.openapi(importCsvRoute, async (c) => {
    if (!isFeatureEnabled("import-csv")) {
      return c.json({ error: "Feature disabled", code: "FEATURE_DISABLED" }, 403);
    }

    const body = c.req.valid("json");
    try {
      const result = importTasksCsv(
        body.csv,
        ({ externalId, title, status }) => {
          const parsedStatus = TaskStatusSchema.safeParse(status);
          const task: z.infer<typeof TaskSchema> = {
            id: crypto.randomUUID(),
            orgId: body.projectId,
            externalId,
            title,
            status: parsedStatus.success ? parsedStatus.data : "todo",
            createdAt: new Date().toISOString(),
          };
          store.set(task.id, task);
        },
        (externalId) => [...store.values()].some((task) =>
          task.orgId === body.projectId && task.externalId === externalId
        ),
      );
      return c.json(result, 200);
    } catch (error) {
      if (error instanceof CsvValidationError) {
        return c.json({ error: { code: "VALIDATION_ERROR", columns: error.columns } }, 422);
      }
      throw error;
    }
  });
}
