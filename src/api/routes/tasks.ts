/**
 * P13#05 — REST routes for the tasks domain.
 *
 * Delegates to the same logic as tRPC tasks.* procedures (public-api gate).
 * Auth: Bearer token format "test-jwt:<orgId>" (real JWT in production).
 * Error mapping: orgId mismatch → 403, unknown ID → 404.
 *
 * Runtime task routes are mounted from the application-backed kernel adapter when deps are present.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { appErrorToHttpResponse } from "../../application/error-mapping.ts";
import { AppInvariantError } from "../../application/errors.ts";
import { CsvValidationError, createTaskCsvApplication } from "../../application/tasks/csv.ts";

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
    422: {
      content: {
        "application/json": {
          schema: z.object({
            error: z.object({
              code: z.string(),
              columns: z.array(z.string()).optional(),
            }),
          }),
        },
      },
      description: "Invalid CSV",
    },
  },
});

// ── Router factory ───────────────────────────────────────────────────────────

export function registerTaskRoutes(api: OpenAPIHono): void {
  const csvApplication = createTaskCsvApplication();

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

  api.openapi(exportCsvRoute, async (c) => {
    if (!isFeatureEnabled("export-csv")) {
      return c.json({ error: "Feature disabled", code: "FEATURE_DISABLED" }, 403);
    }
    const query = c.req.valid("query");
    const csv = await csvApplication.exportTasks({ projectId: query.projectId });
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=\"tasks.csv\"",
      },
    });
  });

  api.openapi(importCsvRoute, async (c) => {
    if (!isFeatureEnabled("import-csv")) {
      return c.json({ error: "Feature disabled", code: "FEATURE_DISABLED" }, 403);
    }
    const body = c.req.valid("json");
    try {
      const result = await csvApplication.importTasks({ projectId: body.projectId, csv: body.csv });
      return c.json(result, 200);
    } catch (error) {
      if (error instanceof CsvValidationError) {
        return c.json({ error: { code: "VALIDATION_ERROR", columns: error.columns } }, 422);
      }
      throw error;
    }
  });
}

function applicationRequired(c: any): any {
  const mapped = appErrorToHttpResponse(new AppInvariantError("Application-backed REST task route is required."));
  return c.json(mapped.body, mapped.status as never);
}
