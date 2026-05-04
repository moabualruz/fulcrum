/**
 * Real notification routes — delegates to product-kernel store.
 */

import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { ApiEnv } from "../auth.ts";
import type { ProductDb } from "../../product-kernel/db/types.ts";
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
  getRule,
} from "../../product-kernel/store/notifications.ts";
import { newUlid } from "../../product-kernel/ids.ts";
import * as S from "../../product-kernel/api/schemas.ts";

// ── Route definitions ────────────────────────────────────────────────

const listNotificationsRoute = createRoute({
  method: "get",
  path: "/notifications",
  tags: ["notifications"],
  summary: "List user notifications",
  responses: {
    200: {
      content: { "application/json": { schema: S.NotificationListResponse } },
      description: "User notifications",
    },
    401: {
      content: { "application/json": { schema: S.ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

const markReadRoute = createRoute({
  method: "post",
  path: "/notifications/{id}/read",
  tags: ["notifications"],
  summary: "Mark notification as read",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    204: { description: "Marked as read" },
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

const listRulesRoute = createRoute({
  method: "get",
  path: "/notifications/rules",
  tags: ["notifications"],
  summary: "List notification rules",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ data: z.array(S.NotificationRuleRow) }),
        },
      },
      description: "Notification rules",
    },
    401: {
      content: { "application/json": { schema: S.ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

const createRuleRoute = createRoute({
  method: "post",
  path: "/notifications/rules",
  tags: ["notifications"],
  summary: "Create a notification rule",
  request: {
    body: { content: { "application/json": { schema: S.CreateRuleBody } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: S.NotificationRuleRow } },
      description: "Rule created",
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

const updateRuleRoute = createRoute({
  method: "patch",
  path: "/notifications/rules/{id}",
  tags: ["notifications"],
  summary: "Update a notification rule",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: S.UpdateRuleBody } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: S.NotificationRuleRow } },
      description: "Rule updated",
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

const deleteRuleRoute = createRoute({
  method: "delete",
  path: "/notifications/rules/{id}",
  tags: ["notifications"],
  summary: "Delete a notification rule",
  request: { params: z.object({ id: z.string() }) },
  responses: {
    204: { description: "Rule deleted" },
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

const ruleConfigRoute = createRoute({
  method: "post",
  path: "/notifications/rules/{id}/config",
  tags: ["notifications"],
  summary: "Save webhook config for a notification rule",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: S.WebhookConfigBody } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: S.WebhookConfigResponse } },
      description: "Webhook config saved (secret masked)",
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

// ── Registration ─────────────────────────────────────────────────────

export function registerKernelNotificationRoutes(api: OpenAPIHono<ApiEnv>): void {
  api.openapi(listNotificationsRoute, async (c) => {
    const db: ProductDb = c.get("db");
    const orgId = c.get("orgId");
    const userId = c.get("userId");
    const rows = await db.query(
      `SELECT id, org_id, user_id, title, body, read, created_at
       FROM notifications WHERE org_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 50`,
      [orgId, userId],
    );
    return c.json({ data: rows } as any, 200);
  });

  api.openapi(markReadRoute, async (c) => {
    const db: ProductDb = c.get("db");
    const { id } = c.req.valid("param");
    const orgId = c.get("orgId");
    const userId = c.get("userId");
    const rows = await db.query(
      `UPDATE notifications SET read = true WHERE id = $1 AND org_id = $2 AND user_id = $3 AND read = false RETURNING id`,
      [id, orgId, userId],
    );
    if (rows.length === 0) return c.json({ error: "not found" }, 404);
    return c.body(null, 204);
  });

  api.openapi(listRulesRoute, async (c) => {
    const db: ProductDb = c.get("db");
    const orgId = c.get("orgId");
    const rules = await listRules(db, orgId);
    return c.json({ data: rules } as any, 200);
  });

  api.openapi(createRuleRoute, async (c) => {
    const db: ProductDb = c.get("db");
    const orgId = c.get("orgId");
    const body = c.req.valid("json");
    try {
      const rule = await createRule(db, {
        orgId,
        name: body.name,
        eventPattern: body.event_pattern,
        channels: body.channels,
        enabled: body.enabled,
      });
      return c.json(rule as any, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  api.openapi(updateRuleRoute, async (c) => {
    const db: ProductDb = c.get("db");
    const { id } = c.req.valid("param");
    const orgId = c.get("orgId");
    const body = c.req.valid("json");
    const rule = await updateRule(db, orgId, id, {
      name: body.name,
      eventPattern: body.event_pattern,
      channels: body.channels,
      enabled: body.enabled,
    });
    if (!rule) return c.json({ error: "not found" }, 404);
    return c.json(rule as any, 200);
  });

  api.openapi(deleteRuleRoute, async (c) => {
    const db: ProductDb = c.get("db");
    const { id } = c.req.valid("param");
    const orgId = c.get("orgId");
    const ok = await deleteRule(db, orgId, id);
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.body(null, 204);
  });

  api.openapi(ruleConfigRoute, async (c) => {
    const db: ProductDb = c.get("db");
    const { id } = c.req.valid("param");
    const orgId = c.get("orgId");
    const body = c.req.valid("json");

    const rule = await getRule(db, orgId, id);
    if (!rule) return c.json({ error: "not found" }, 404);

    const configId = newUlid();
    await db.query(
      `INSERT INTO webhook_rule_configs (id, org_id, rule_id, url, encrypted_secret)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (rule_id)
       DO UPDATE SET url = EXCLUDED.url, encrypted_secret = EXCLUDED.encrypted_secret, updated_at = now()`,
      [configId, orgId, id, body.url, body.secret],
    );

    const masked = body.secret.length > 4
      ? body.secret.slice(0, 4) + "***"
      : body.secret + "***";

    return c.json({ url: body.url, secret: masked }, 200);
  });
}
