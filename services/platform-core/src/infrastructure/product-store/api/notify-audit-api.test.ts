import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  NotificationPublicApiController,
  NotificationPublicApiService,
} from "@notification-center/interface/http/notification-public-api.controller.ts";
import {
  AuditPublicApiController,
  AuditPublicApiService,
} from "@workflow-coordination/interface/http/audit-public-api.controller.ts";

describe("notification public API contract", () => {
  test("returns application notifications with valid facade context", async () => {
    const controller = new NotificationPublicApiController(
      new NotificationPublicApiService({
        featuresEnv: "public-api",
        application: {
          listNotifications: async () => ({ data: [{ id: "notification-1", title: "Test notification" }] }),
          markRead: async () => ({ id: "notification-1" }),
          unreadCount: async () => ({ count: 1 }),
          markAllRead: async () => ({ count: 1 }),
        },
      }),
    );

    await expect(controller.listNotifications({ orgId: "org-1", userId: "user-1" })).resolves.toEqual({
      data: [{ id: "notification-1", title: "Test notification" }],
    });
  });
});

describe("audit public API contract", () => {
  test("returns application audit events with valid facade context", async () => {
    const controller = new AuditPublicApiController(
      new AuditPublicApiService({
        featuresEnv: "public-api",
        application: {
          queryAuditEvents: async () => ({ data: [{ id: "event-1", kind: "task" }], total: 1 }),
        },
      }),
    );

    await expect(controller.listAuditEvents({ orgId: "org-1", kind: "task" })).resolves.toEqual({
      data: [{ id: "event-1", kind: "task" }],
      total: 1,
    });
  });
});
