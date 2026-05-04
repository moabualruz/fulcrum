/**
 * Real report routes — burndown + velocity from product-kernel.
 */

import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { ApiEnv } from "../auth.ts";
import { velocity, burndown } from "../../product-kernel/reports.ts";
import * as S from "../../product-kernel/api/schemas.ts";

const burndownRoute = createRoute({
  method: "get",
  path: "/reports/burndown",
  tags: ["reports"],
  summary: "Burndown chart data",
  request: { query: S.BurndownQuery },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ data: z.array(S.BurndownRow) }) } },
      description: "Burndown chart data",
    },
    401: {
      content: { "application/json": { schema: S.ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

const velocityRoute = createRoute({
  method: "get",
  path: "/reports/velocity",
  tags: ["reports"],
  summary: "Sprint velocity report",
  request: { query: S.VelocityQuery },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ data: z.array(S.VelocityRow) }) } },
      description: "Velocity report",
    },
    401: {
      content: { "application/json": { schema: S.ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

export function registerKernelReportRoutes(api: OpenAPIHono<ApiEnv>): void {
  api.openapi(burndownRoute, async (c) => {
    const db = c.get("db");
    const { project_id, sprint_id } = c.req.valid("query");
    const data = await burndown(db, project_id, sprint_id);
    return c.json({ data }, 200);
  });

  api.openapi(velocityRoute, async (c) => {
    const db = c.get("db");
    const { project_id } = c.req.valid("query");
    const data = await velocity(db, project_id);
    return c.json({ data }, 200);
  });
}
