import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { KernelReportApplication } from "../application.ts";
import type { ApiEnv } from "../auth.ts";

const ErrorResponse = z.object({ error: z.string() });
const JsonScalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const ReportResponse = z.object({ data: z.array(z.record(z.string(), JsonScalar)) });

const burndownRoute = createRoute({
  method: "get",
  path: "/reports/burndown",
  tags: ["reports"],
  summary: "Burndown chart data",
  request: {
    query: z.object({
      project_id: z.string(),
      sprint_id: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: ReportResponse } },
      description: "Burndown chart data",
    },
    401: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

const velocityRoute = createRoute({
  method: "get",
  path: "/reports/velocity",
  tags: ["reports"],
  summary: "Sprint velocity report",
  request: { query: z.object({ project_id: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: ReportResponse } },
      description: "Velocity report",
    },
    401: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

export function registerKernelReportRoutes(
  api: OpenAPIHono<ApiEnv>,
  options: { application?: KernelReportApplication } = {},
): void {
  api.openapi(burndownRoute, async (c) => {
    const application = options.application ?? c.get("application")?.reports;
    const { project_id, sprint_id } = c.req.valid("query");
    if (!application) return c.json({ data: [] }, 200);
    return c.json(
      await application.burndown({
        orgId: c.get("orgId"),
        projectId: project_id,
        sprintId: sprint_id,
      }) as never,
      200,
    );
  });

  api.openapi(velocityRoute, async (c) => {
    const application = options.application ?? c.get("application")?.reports;
    const { project_id } = c.req.valid("query");
    if (!application) return c.json({ data: [] }, 200);
    return c.json(
      await application.velocity({
        orgId: c.get("orgId"),
        projectId: project_id,
      }) as never,
      200,
    );
  });
}
