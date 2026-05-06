import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { EntityManager } from "@mikro-orm/postgresql";

import * as taskCommands from "../../application/tasks/commands.ts";
import * as taskQueries from "../../application/tasks/queries.ts";
import { CreateTaskInputSchema, TaskDtoSchema, UpdateTaskInputSchema } from "../../application/tasks/schema.ts";
import type { AppContext } from "../../application/tasks/types.ts";
import { appErrorToHttpResponse } from "../../application/error-mapping.ts";
import { AppError, AppInvariantError } from "../../application/errors.ts";
import type { ApiEnv } from "../auth.ts";

const taskApplication = {
  createTask: taskCommands.createTask,
  updateTask: taskCommands.updateTask,
  deleteTask: taskCommands.deleteTask,
  listTasks: taskQueries.listTasks,
  getTask: taskQueries.getTask,
};

export function __setKernelTaskApplicationForTest(overrides: Partial<typeof taskApplication>): () => void {
  const previous = { ...taskApplication };
  Object.assign(taskApplication, overrides);
  return () => Object.assign(taskApplication, previous);
}

// ── Route definitions ────────────────────────────────────────────────

const ErrorResponse = z.object({ error: z.string(), code: z.string().optional() });
const TaskListQuery = z.object({
  include_deleted: z.coerce.boolean().optional(),
});
const CreateTaskBody = CreateTaskInputSchema.extend({
  project_id: z.uuid().nullable().optional(),
}).omit({ projectId: true }).passthrough();
const UpdateTaskBody = UpdateTaskInputSchema.omit({ id: true }).extend({
  project_id: z.uuid().nullable().optional(),
}).omit({ projectId: true }).passthrough();

const listTasksRoute = createRoute({
  method: "get",
  path: "/tasks",
  tags: ["tasks"],
  summary: "List tasks (paginated)",
  request: { query: TaskListQuery },
  responses: {
    200: {
      content: { "application/json": { schema: z.array(TaskDtoSchema) } },
      description: "Paginated task list",
    },
    401: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

const createTaskRoute = createRoute({
  method: "post",
  path: "/tasks",
  tags: ["tasks"],
  summary: "Create a task",
  request: {
    body: { content: { "application/json": { schema: CreateTaskBody } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: z.object({ id: z.string() }) } },
      description: "Task created",
    },
    400: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Validation error",
    },
    401: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

const updateTaskRoute = createRoute({
  method: "patch",
  path: "/tasks/{id}",
  tags: ["tasks"],
  summary: "Update a task",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: UpdateTaskBody } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } },
      description: "Task updated",
    },
    404: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Not found",
    },
    401: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

const deleteTaskRoute = createRoute({
  method: "delete",
  path: "/tasks/{id}",
  tags: ["tasks"],
  summary: "Delete a task",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    204: { description: "Task deleted" },
    401: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

// ── Registration ─────────────────────────────────────────────────────

export function registerKernelTaskRoutes(api: OpenAPIHono<ApiEnv>): void {
  api.openapi(listTasksRoute, async (c) => {
    const q = c.req.valid("query");
    return await mapHttpError(c, async () => {
      const result = await taskApplication.listTasks(resolveEntityManager(c), appContext(c), {
        includeDeleted: q.include_deleted,
      });
      return c.json(result as never, 200);
    }) as never;
  });

  api.openapi(createTaskRoute, async (c) => {
    const body = c.req.valid("json");
    return await mapHttpError(c, async () => {
      const task = await taskApplication.createTask(resolveEntityManager(c), appContext(c), {
        projectId: body.project_id ?? null,
        title: body.title,
        description: body.description ?? null,
        descriptionText: body.descriptionText,
        tiptapContent: body.tiptapContent,
        status: body.status,
        priority: body.priority,
        points: body.points,
        assigneeId: body.assigneeId,
      });
      return c.json({ id: task.id }, 201);
    }) as never;
  });

  api.openapi(updateTaskRoute, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    return await mapHttpError(c, async () => {
      await taskApplication.updateTask(resolveEntityManager(c), appContext(c), id, {
        ...body,
        projectId: body.project_id ?? undefined,
      });
      return c.json({ ok: true as const }, 200);
    }) as never;
  });

  api.openapi(deleteTaskRoute, async (c) => {
    const { id } = c.req.valid("param");
    return await mapHttpError(c, async () => {
      await taskApplication.deleteTask(resolveEntityManager(c), appContext(c), id);
      return c.body(null, 204);
    }) as never;
  });
}

function appContext(c: any): AppContext {
  return { orgId: c.get("orgId"), userId: c.get("userId"), projectId: null };
}

function resolveEntityManager(c: any): EntityManager {
  const db = c.get("db") as unknown;
  if (db && typeof db === "object" && "transactional" in db) return db as EntityManager;
  if (db && typeof db === "object" && "em" in db) {
    const entityManager = (db as { em?: unknown }).em;
    if (entityManager && typeof entityManager === "object" && "transactional" in entityManager) {
      return entityManager as EntityManager;
    }
  }
  throw new AppInvariantError("EntityManager could not be resolved.");
}

async function mapHttpError(
  c: any,
  fn: () => Promise<Response>,
): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    const mapped = appErrorToHttpResponse(error instanceof AppError ? error : new AppInvariantError(String(error), { cause: error }));
    return c.json(mapped.body, mapped.status as never);
  }
}
