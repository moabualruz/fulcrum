/**
 * Real sprint routes — delegates to product-kernel repositories.
 */

import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { ApiEnv } from "../auth.ts";
import {
  createSprint,
  updateSprint,
  listSprints,
} from "../../product-kernel/store/repositories.ts";
import * as S from "../../product-kernel/api/schemas.ts";

const listSprintsRoute = createRoute({
  method: "get",
  path: "/sprints",
  tags: ["sprints"],
  summary: "List sprints for a project",
  request: { query: z.object({ project_id: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ data: z.array(S.SprintRow) }) } },
      description: "Sprint list",
    },
    401: {
      content: { "application/json": { schema: S.ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

const createSprintRoute = createRoute({
  method: "post",
  path: "/sprints",
  tags: ["sprints"],
  summary: "Create a sprint",
  request: {
    body: { content: { "application/json": { schema: S.CreateSprintBody } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: S.SprintRow } },
      description: "Sprint created",
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

const updateSprintRoute = createRoute({
  method: "patch",
  path: "/sprints/{id}",
  tags: ["sprints"],
  summary: "Update a sprint",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: S.UpdateSprintBody } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: S.SprintRow } },
      description: "Sprint updated",
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

export function registerKernelSprintRoutes(api: OpenAPIHono<ApiEnv>): void {
  api.openapi(listSprintsRoute, async (c) => {
    const db = c.get("db");
    const { project_id } = c.req.valid("query");
    const data = await listSprints(db, project_id);
    return c.json({ data } as any, 200);
  });

  api.openapi(createSprintRoute, async (c) => {
    const db = c.get("db");
    const body = c.req.valid("json");
    const orgId = c.get("orgId");
    try {
      const sprint = await createSprint(db, {
        orgId,
        projectId: body.project_id,
        name: body.name,
        goal: body.goal ?? null,
        status: body.status,
        capacityPoints: body.capacity_points,
        startDate: body.start_date ?? null,
        endDate: body.end_date ?? null,
      });
      return c.json(sprint as any, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  api.openapi(updateSprintRoute, async (c) => {
    const db = c.get("db");
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    try {
      const sprint = await updateSprint(db, {
        id,
        name: body.name,
        goal: body.goal,
        status: body.status,
        capacityPoints: body.capacity_points,
        startDate: body.start_date,
        endDate: body.end_date,
      });
      return c.json(sprint as any, 200);
    } catch (err: any) {
      if (err.message.includes("not found")) {
        return c.json({ error: err.message }, 404);
      }
      return c.json({ error: err.message } as any, 404);
    }
  });
}
