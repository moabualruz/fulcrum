/**
 * P13#06 — REST routes for the notifications domain.
 * GET /notifications → notify.list tRPC
 * PATCH /notifications/:id/mark-read → notify.markRead tRPC
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { appErrorToHttpResponse } from "../../application/error-mapping.ts";
import { AppInvariantError } from "../../application/errors.ts";

// ── Schemas ──────────────────────────────────────────────────────────────────

const NotificationSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    userId: z.string(),
    kind: z.string(),
    title: z.string(),
    read: z.boolean(),
    createdAt: z.string().datetime(),
  })
  .openapi("Notification");

const NotifIdParamSchema = z.object({ id: z.string().uuid() });

const ErrorSchema = z
  .object({ error: z.string(), code: z.string() })
  .openapi("NotifyError");

// ── Routes ────────────────────────────────────────────────────────────────────

const listRoute = createRoute({
  method: "get",
  path: "/notifications",
  tags: ["notifications"],
  summary: "List notifications",
  responses: {
    200: {
      content: { "application/json": { schema: z.array(NotificationSchema) } },
      description: "Notifications",
    },
  },
});

const markReadRoute = createRoute({
  method: "patch",
  path: "/notifications/{id}/mark-read",
  tags: ["notifications"],
  summary: "Mark notification as read",
  request: { params: NotifIdParamSchema },
  responses: {
    204: { description: "Marked as read" },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Not found",
    },
  },
});

type NotificationsFacade = {
  listNotifications?(input: { orgId?: string; userId?: string }): Promise<unknown>;
  list?(input: { orgId?: string; userId?: string }): Promise<unknown>;
  markRead(input: { id: string; orgId?: string; userId?: string }): Promise<unknown>;
};

export function registerNotificationRoutes(api: OpenAPIHono): void {
  api.openapi(listRoute, async (c) => {
    const facade = getNotificationsFacade(c);
    if (!facade) return applicationRequired(c);
    const context = c as any;
    const input = { orgId: context.get("orgId") as string | undefined, userId: context.get("userId") as string | undefined };
    const result = facade.listNotifications ? await facade.listNotifications(input) : await facade.list?.(input);
    const notifications = Array.isArray(result) ? result : (result as { data?: unknown[] } | undefined)?.data;
    return c.json(z.array(NotificationSchema).parse(toJsonDates(notifications ?? [])), 200);
  });

  api.openapi(markReadRoute, async (c) => {
    const { id } = c.req.valid("param");
    const facade = getNotificationsFacade(c);
    if (!facade) return applicationRequired(c);
    const result = await facade.markRead({
      id,
      orgId: (c as any).get("orgId") as string | undefined,
      userId: (c as any).get("userId") as string | undefined,
    });
    if (!result) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    return new Response(null, { status: 204 }) as any;
  });
}

function getNotificationsFacade(c: any): NotificationsFacade | undefined {
  const application = c.get("application") as { notifications?: NotificationsFacade } | undefined;
  if (application?.notifications?.markRead) return application.notifications;
  const trpc = c.get("trpc") as { notify?: NotificationsFacade; notifications?: NotificationsFacade } | undefined;
  return trpc?.notify ?? trpc?.notifications;
}

function toJsonDates(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function applicationRequired(c: any): any {
  const mapped = appErrorToHttpResponse(new AppInvariantError("Application-backed REST notifications route is required."));
  return c.json(mapped.body, mapped.status as never);
}
