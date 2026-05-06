import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { KernelSprintApplication } from "../application.ts";
import type { ApiEnv } from "../auth.ts";

const ErrorResponse = z.object({ error: z.string() });
const SprintListResponse = z.object({ data: z.array(z.unknown()) });

const listSprintsRoute = createRoute({
  method: "get",
  path: "/sprints",
  tags: ["sprints"],
  summary: "List sprints for a project",
  request: { query: z.object({ project_id: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: SprintListResponse } },
      description: "Sprint list",
    },
    401: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

export function registerKernelSprintRoutes(
  api: OpenAPIHono<ApiEnv>,
  options: { application?: KernelSprintApplication } = {},
): void {
  api.openapi(listSprintsRoute, async (c) => {
    const application = options.application ?? c.get("application")?.sprints;
    const { project_id } = c.req.valid("query");
    if (!application) return c.json({ data: [] }, 200);
    return c.json(
      await application.listSprints({
        orgId: c.get("orgId"),
        projectId: project_id,
      }) as never,
      200,
    );
  });
}
