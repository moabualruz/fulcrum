import { describe, expect, mock, test } from "bun:test";
import { OpenAPIHono } from "@hono/zod-openapi";

import type { ApiEnv } from "../auth.ts";
import { registerKernelAuditRoutes } from "./kernel-audit.ts";
import { registerKernelNotificationRoutes } from "./kernel-notifications.ts";
import { registerKernelSprintRoutes } from "./kernel-sprints.ts";

function apiWithIdentity(): OpenAPIHono<ApiEnv> {
  const api = new OpenAPIHono<ApiEnv>();
  api.use("*", async (c, next) => {
    c.set("orgId", "org-1");
    c.set("userId", "user-1");
    await next();
  });
  return api;
}

describe("kernel Hono routes delegate to application modules", () => {
  test("audit query calls application query", async () => {
    const api = apiWithIdentity();
    const queryAuditEvents = mock(async () => ({ data: [], total: 0 }));

    registerKernelAuditRoutes(api, {
      application: { queryAuditEvents },
    });

    const response = await api.request("/audit?limit=10");

    expect(response.status).toBe(200);
    expect(queryAuditEvents).toHaveBeenCalledWith({
      orgId: "org-1",
      kind: undefined,
      verb: undefined,
      since: undefined,
      until: undefined,
      limit: 10,
      offset: undefined,
    });
  });

  test("notification list calls application query", async () => {
    const api = apiWithIdentity();
    const listNotifications = mock(async () => ({ data: [] }));

    registerKernelNotificationRoutes(api, {
      application: { listNotifications },
    });

    const response = await api.request("/notifications");

    expect(response.status).toBe(200);
    expect(listNotifications).toHaveBeenCalledWith({
      orgId: "org-1",
      userId: "user-1",
    });
  });

  test("sprint list calls application query", async () => {
    const api = apiWithIdentity();
    const listSprints = mock(async () => ({ data: [] }));

    registerKernelSprintRoutes(api, {
      application: { listSprints },
    });

    const response = await api.request("/sprints?project_id=project-1");

    expect(response.status).toBe(200);
    expect(listSprints).toHaveBeenCalledWith({
      orgId: "org-1",
      projectId: "project-1",
    });
  });
});
