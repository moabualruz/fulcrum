import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { EntityManager } from "@mikro-orm/postgresql";

import { listSprints } from "../../application/sprints/queries.ts";
import { appErrorToHttpResponse } from "../../application/error-mapping.ts";
import { AppInvariantError } from "../../application/errors.ts";
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
    const orgId = c.get("orgId");
    return await mapHttpError(c, async () => {
      if (application) {
        return c.json(await application.listSprints({ orgId, projectId: project_id }) as never, 200);
      }
      const result = await listSprints(resolveEntityManager(c), { orgId, userId: c.get("userId"), projectId: project_id }, {
        projectId: project_id,
      });
      return c.json({ data: result } as never, 200);
    }) as never;
  });
}

function resolveEntityManager(c: { get(key: string): unknown }): EntityManager {
  const db = c.get("db");
  if (db && typeof db === "object" && "transactional" in db) return db as EntityManager;
  if (db && typeof db === "object" && "em" in db) {
    const entityManager = (db as { em?: unknown }).em;
    if (entityManager && typeof entityManager === "object" && "transactional" in entityManager) {
      return entityManager as EntityManager;
    }
  }
  throw new AppInvariantError("EntityManager could not be resolved.");
}

async function mapHttpError(c: any, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    const mapped = appErrorToHttpResponse(error);
    return c.json(mapped.body, mapped.status as never);
  }
}
