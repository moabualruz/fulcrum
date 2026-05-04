/**
 * Real task routes — delegates to product-kernel repositories + services.
 * Replaces the stub in tasks.ts for authenticated API consumers.
 */

import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { ApiEnv } from "../auth.ts";
import {
  createTask,
  listTasks,
} from "../../product-kernel/store/repositories.ts";
import {
  updateTaskAction,
  deleteTaskAction,
} from "../../services/tasks.ts";
import * as S from "../../product-kernel/api/schemas.ts";

// ── Route definitions ────────────────────────────────────────────────

const listTasksRoute = createRoute({
  method: "get",
  path: "/tasks",
  tags: ["tasks"],
  summary: "List tasks (paginated)",
  request: { query: S.TaskListQuery },
  responses: {
    200: {
      content: { "application/json": { schema: S.TaskListResponse } },
      description: "Paginated task list",
    },
    401: {
      content: { "application/json": { schema: S.ErrorResponse } },
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
    body: { content: { "application/json": { schema: S.CreateTaskBody } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: z.object({ id: z.string() }) } },
      description: "Task created",
    },
    400: {
      content: { "application/json": { schema: S.ErrorResponse } },
      description: "Validation error",
    },
    401: {
      content: { "application/json": { schema: S.ErrorResponse } },
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
    body: { content: { "application/json": { schema: S.UpdateTaskBody } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } },
      description: "Task updated",
    },
    404: {
      content: { "application/json": { schema: S.ErrorResponse } },
      description: "Not found",
    },
    401: {
      content: { "application/json": { schema: S.ErrorResponse } },
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
      content: { "application/json": { schema: S.ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

// ── Registration ─────────────────────────────────────────────────────

export function registerKernelTaskRoutes(api: OpenAPIHono<ApiEnv>): void {
  api.openapi(listTasksRoute, async (c) => {
    const db = c.get("db");
    const q = c.req.valid("query");
    const result = await listTasks(db, {
      projectId: q.project_id,
      status: q.status,
      sprintId: q.sprint_id,
      assigneeId: q.assignee_id,
      cursor: q.cursor,
      limit: q.limit,
    });
    return c.json(result as any, 200);
  });

  api.openapi(createTaskRoute, async (c) => {
    const db = c.get("db");
    const body = c.req.valid("json");
    const orgId = c.get("orgId");
    try {
      const task = await createTask(db, {
        orgId,
        projectId: body.project_id ?? null,
        title: body.title,
        description: body.description ?? null,
        status: body.status,
        priority: body.priority,
      });
      return c.json({ id: task.id }, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  api.openapi(updateTaskRoute, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = c.get("db");
    try {
      await updateTaskAction(db, { id, ...body });
      return c.json({ ok: true as const }, 200);
    } catch (err: any) {
      if (err.message.includes("not found")) {
        return c.json({ error: err.message }, 404);
      }
      return c.json({ error: err.message } as any, 404);
    }
  });

  api.openapi(deleteTaskRoute, async (c) => {
    const { id } = c.req.valid("param");
    const db = c.get("db");
    await deleteTaskAction(db, id);
    return c.body(null, 204);
  });
}
