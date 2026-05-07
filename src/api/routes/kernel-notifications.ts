import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { EntityManager } from "@mikro-orm/postgresql";

import { listNotifications } from "../../application/notifications/queries.ts";
import { appErrorToHttpResponse } from "../../application/error-mapping.ts";
import { AppInvariantError } from "../../application/errors.ts";
import type { KernelNotificationApplication } from "../application.ts";
import type { ApiEnv } from "../auth.ts";

const ErrorResponse = z.object({ error: z.string() });
const JsonScalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const NotificationListResponse = z.object({ data: z.array(z.record(z.string(), JsonScalar)) });

const listNotificationsRoute = createRoute({
  method: "get",
  path: "/notifications",
  tags: ["notifications"],
  summary: "List user notifications",
  responses: {
    200: {
      content: { "application/json": { schema: NotificationListResponse } },
      description: "User notifications",
    },
    401: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

const markNotificationReadRoute = createRoute({
  method: "patch",
  path: "/notifications/{id}/mark-read",
  tags: ["notifications"],
  summary: "Mark notification as read",
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    204: { description: "Marked as read" },
    404: {
      content: { "application/json": { schema: ErrorResponse } },
      description: "Notification not found",
    },
  },
});

export function registerKernelNotificationRoutes(
  api: OpenAPIHono<ApiEnv>,
  options: { application?: KernelNotificationApplication } = {},
): void {
  api.openapi(listNotificationsRoute, async (c) => {
    const application = options.application ?? c.get("application")?.notifications;
    const orgId = c.get("orgId");
    const userId = c.get("userId");
    return await mapHttpError(c, async () => {
      if (application) {
        return c.json(await application.listNotifications({ orgId, userId }) as never, 200);
      }
      const result = await listNotifications(resolveEntityManager(c), { orgId, userId }, { limit: 50, offset: 0 });
      return c.json({ data: result.items } as never, 200);
    }) as never;
  });

  api.openapi(markNotificationReadRoute, async (c) => {
    const application = options.application ?? c.get("application")?.notifications;
    const orgId = c.get("orgId");
    const userId = c.get("userId");
    const { id } = c.req.valid("param");
    return await mapHttpError(c, async () => {
      if (!application?.markRead) {
        throw new AppInvariantError("Application-backed REST notifications mark-read route is required.");
      }
      const result = await application.markRead({ orgId, userId, id });
      if (!result) return c.json({ error: "Notification not found." } as never, 404);
      return new Response(null, { status: 204 });
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
