/**
 * Public REST/OpenAPI router for tasks, sprints, and reports.
 * Gated by FULCRUM_FEATURES=public-api. Auth: session cookie or API key.
 */
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { ProductDb } from "../db/types.ts";
import type { EntityManager } from "@mikro-orm/postgresql";
import {
  createTask,
  createSprint,
  updateSprint,
  listSprints,
  listTasks,
  findApiKeyByHash,
  type TaskRow,
  type SprintRow,
} from "../store/repositories.ts";
import {
  updateTaskAction,
  deleteTaskAction,
} from "../../web/src/lib/server/tasks.ts";
import { getEm } from "../../web/src/lib/server/em.ts";
import { velocity, burndown } from "../reports.ts";
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
  getRule,
} from "../store/notifications.ts";
import { queryAuditEvents } from "../store/audit.ts";
import { newUlid } from "../ids.ts";
import * as S from "./schemas.ts";

// ── Types ────────────────────────────────────────────────────────────

interface ApiEnv {
  Variables: {
    db: ProductDb;
    orgId: string;
    userId: string;
  };
}

// ── Auth middleware ──────────────────────────────────────────────────

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function authMiddleware() {
  return async (c: any, next: () => Promise<void>) => {
    const db: ProductDb = c.get("db");
    const authHeader = c.req.header("Authorization");

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const keyHash = await hashKey(token);
      const apiKey = await findApiKeyByHash(db, keyHash);
      if (!apiKey) {
        return c.json({ error: "invalid API key" }, 401);
      }
      c.set("orgId", apiKey.org_id);
      c.set("userId", apiKey.user_id);
      return next();
    }

    // No valid auth
    return c.json({ error: "authentication required" }, 401);
  };
}

// ── Route definitions ────────────────────────────────────────────────

const listTasksRoute = createRoute({
  method: "get",
  path: "/tasks",
  request: { query: S.TaskListQuery },
  responses: {
    200: {
      content: { "application/json": { schema: S.TaskListResponse } },
      description: "Paginated task list",
    },
    401: {
      content: { "application/json": { schema: S.ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

const createTaskRoute = createRoute({
  method: "post",
  path: "/tasks",
  request: {
    body: { content: { "application/json": { schema: S.CreateTaskBody } } },
  },
  responses: {
    201: {
      content: { "application/json": { schema: z.object({ id: z.string() }) } },
      description: "Task created",
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

const updateTaskRoute = createRoute({
  method: "patch",
  path: "/tasks/{id}",
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { "application/json": { schema: S.UpdateTaskBody } } },
  },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ ok: z.literal(true) }) } },
      description: "Task updated",
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

const deleteTaskRoute = createRoute({
  method: "delete",
  path: "/tasks/{id}",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    204: { description: "Task deleted" },
    401: {
      content: { "application/json": { schema: S.ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

const listSprintsRoute = createRoute({
  method: "get",
  path: "/sprints",
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

const burndownRoute = createRoute({
  method: "get",
  path: "/reports/burndown",
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

// ── Notification routes ─────────────────────────────────────────────

const listNotificationsRoute = createRoute({
  method: "get",
  path: "/notifications",
  tags: ["notifications"],
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

// ── Audit routes ────────────────────────────────────────────────────

const auditQueryRoute = createRoute({
  method: "get",
  path: "/audit",
  tags: ["audit"],
  request: { query: S.AuditQueryParams },
  responses: {
    200: {
      content: { "application/json": { schema: S.AuditListResponse } },
      description: "Audit events",
    },
    401: {
      content: { "application/json": { schema: S.ErrorResponse } },
      description: "Unauthorized",
    },
  },
});

// ── Build router ─────────────────────────────────────────────────────

export function createPublicApi(db: ProductDb, defaultOrgId: string) {
  const app = new OpenAPIHono<ApiEnv>();

  // Inject DB into context
  app.use("*", async (c, next) => {
    c.set("db", db);
    return next();
  });

  // Auth on all routes except /openapi.json
  app.use("*", async (c, next) => {
    if (c.req.path === "/openapi.json") return next();
    return authMiddleware()(c, next);
  });

  // ── Tasks ──

  app.openapi(listTasksRoute, async (c) => {
    const q = c.req.valid("query");
    const result = await listTasks(db, {
      projectId: q.project_id,
      status: q.status,
      sprintId: q.sprint_id,
      assigneeId: q.assignee_id,
      cursor: q.cursor,
      limit: q.limit,
    });
    return c.json(result as any, 200);
  });

  app.openapi(createTaskRoute, async (c) => {
    const body = c.req.valid("json");
    const orgId = c.get("orgId");
    try {
      const task = await createTask(db, {
        orgId,
        projectId: body.project_id ?? null,
        title: body.title,
        description: body.description ?? null,
        status: body.status,
        priority: body.priority,
      });
      return c.json({ id: task.id }, 201);
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  app.openapi(updateTaskRoute, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    try {
      const em = await getEm();
      await updateTaskAction(em, { id, ...body });
      return c.json({ ok: true as const }, 200);
    } catch (err: any) {
      if (err.message.includes("not found")) {
        return c.json({ error: err.message }, 404);
      }
      return c.json({ error: err.message } as any, 404);
    }
  });

  app.openapi(deleteTaskRoute, async (c) => {
    const { id } = c.req.valid("param");
    const em = await getEm();
    await deleteTaskAction(em, id);
    return c.body(null, 204);
  });

  // ── Sprints ──

  app.openapi(listSprintsRoute, async (c) => {
    const { project_id } = c.req.valid("query");
    const data = await listSprints(db, project_id);
    return c.json({ data } as any, 200);
  });

  app.openapi(createSprintRoute, async (c) => {
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

  app.openapi(updateSprintRoute, async (c) => {
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

  // ── Reports ──

  app.openapi(burndownRoute, async (c) => {
    const { project_id, sprint_id } = c.req.valid("query");
    const data = await burndown(db, project_id, sprint_id);
    return c.json({ data }, 200);
  });

  app.openapi(velocityRoute, async (c) => {
    const { project_id } = c.req.valid("query");
    const data = await velocity(db, project_id);
    return c.json({ data }, 200);
  });

  // ── Notifications ──

  app.openapi(listNotificationsRoute, async (c) => {
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

  app.openapi(markReadRoute, async (c) => {
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

  app.openapi(listRulesRoute, async (c) => {
    const orgId = c.get("orgId");
    const rules = await listRules(db, orgId);
    return c.json({ data: rules } as any, 200);
  });

  app.openapi(createRuleRoute, async (c) => {
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

  app.openapi(updateRuleRoute, async (c) => {
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

  app.openapi(deleteRuleRoute, async (c) => {
    const { id } = c.req.valid("param");
    const orgId = c.get("orgId");
    const ok = await deleteRule(db, orgId, id);
    if (!ok) return c.json({ error: "not found" }, 404);
    return c.body(null, 204);
  });

  app.openapi(ruleConfigRoute, async (c) => {
    const { id } = c.req.valid("param");
    const orgId = c.get("orgId");
    const body = c.req.valid("json");

    // Verify rule exists
    const rule = await getRule(db, orgId, id);
    if (!rule) return c.json({ error: "not found" }, 404);

    // Upsert webhook config
    const configId = newUlid();
    await db.query(
      `INSERT INTO webhook_rule_configs (id, org_id, rule_id, url, encrypted_secret)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (rule_id)
       DO UPDATE SET url = EXCLUDED.url, encrypted_secret = EXCLUDED.encrypted_secret, updated_at = now()`,
      [configId, orgId, id, body.url, body.secret],
    );

    // Mask secret: first 4 chars + ***
    const masked = body.secret.length > 4
      ? body.secret.slice(0, 4) + "***"
      : body.secret + "***";

    return c.json({ url: body.url, secret: masked }, 200);
  });

  // ── Audit ──

  app.openapi(auditQueryRoute, async (c) => {
    const orgId = c.get("orgId");
    const q = c.req.valid("query");
    const result = await queryAuditEvents(db, {
      orgId,
      kind: q.kind,
      verb: q.verb,
      since: q.since,
      until: q.until,
      limit: q.limit,
      offset: q.offset,
    });
    return c.json({ data: result.items, total: result.total } as any, 200);
  });

  // ── OpenAPI spec ──

  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: { title: "Fulcrum Public API", version: "1.0.0" },
  });

  return app;
}

// ── Feature gate ─────────────────────────────────────────────────────

export function isPublicApiEnabled(): boolean {
  const features = process.env.FULCRUM_FEATURES ?? "";
  return features.split(",").map((f) => f.trim()).includes("public-api");
}
