/**
 * P13#06 — REST routes for the notifications domain.
 * GET /notifications → notify.list tRPC
 * PATCH /notifications/:id/mark-read → notify.markRead tRPC
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

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

// ── Stub store ────────────────────────────────────────────────────────────────

const FIXED_ORG = "11111111-1111-4111-8111-111111111111";

function makeNotifStore(): Map<string, z.infer<typeof NotificationSchema>> {
  return new Map([
    [
      "ffffffff-ffff-4fff-8fff-ffffffffffff",
      {
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        orgId: FIXED_ORG,
        userId: "user-1",
        kind: "mention",
        title: "You were mentioned",
        read: false,
        createdAt: "2026-01-20T10:00:00.000Z",
      },
    ],
  ]);
}

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

export function registerNotificationRoutes(api: OpenAPIHono): void {
  const store = makeNotifStore();

  api.openapi(listRoute, (c) => {
    return c.json([...store.values()], 200);
  });

  api.openapi(markReadRoute, (c) => {
    const { id } = c.req.valid("param");
    const notif = store.get(id);
    if (!notif) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
    store.set(id, { ...notif, read: true });
    return new Response(null, { status: 204 });
  });
}
