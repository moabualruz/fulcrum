import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { KernelNotificationApplication } from "../application.ts";
import type { ApiEnv } from "../auth.ts";

const ErrorResponse = z.object({ error: z.string() });
const NotificationListResponse = z.object({ data: z.array(z.unknown()) });

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

export function registerKernelNotificationRoutes(
  api: OpenAPIHono<ApiEnv>,
  options: { application?: KernelNotificationApplication } = {},
): void {
  api.openapi(listNotificationsRoute, async (c) => {
    const application = options.application ?? c.get("application")?.notifications;
    if (!application) return c.json({ data: [] }, 200);
    return c.json(
      await application.listNotifications({
        orgId: c.get("orgId"),
        userId: c.get("userId"),
      }) as never,
      200,
    );
  });
}
