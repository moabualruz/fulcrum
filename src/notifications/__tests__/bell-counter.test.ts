import { describe, expect, test } from "bun:test";

import { BellCounterPoll } from "../bell-counter-poll.ts";
import {
  calculateUnreadNotificationCount,
  markNotificationRead,
} from "../../trpc/routers/notifications.ts";

describe("notification bell counter source of truth", () => {
  test("unread badge count uses only user notification rows with readAt = null", () => {
    const rows = [
      { id: "n1", orgId: "org-1", userId: "user-1", readAt: null },
      { id: "n2", orgId: "org-1", userId: "user-1", readAt: new Date("2026-05-05T10:00:00Z") },
      { id: "n3", orgId: "org-1", userId: "user-1", readAt: null },
      { id: "n4", orgId: "org-1", userId: "user-2", readAt: null },
      { id: "n5", orgId: "org-2", userId: "user-1", readAt: null },
    ];

    expect(calculateUnreadNotificationCount(rows, { orgId: "org-1", userId: "user-1" })).toBe(2);
  });

  test("markRead decreases unread by one and cannot decrease below zero", () => {
    const now = new Date("2026-05-05T12:00:00Z");
    const rows = [
      { id: "n1", orgId: "org-1", userId: "user-1", readAt: null as Date | null },
    ];

    expect(calculateUnreadNotificationCount(rows, { orgId: "org-1", userId: "user-1" })).toBe(1);
    expect(markNotificationRead(rows[0]!, now)).toBe(true);
    expect(calculateUnreadNotificationCount(rows, { orgId: "org-1", userId: "user-1" })).toBe(0);
    expect(markNotificationRead(rows[0]!, new Date("2026-05-05T12:01:00Z"))).toBe(false);
    expect(calculateUnreadNotificationCount(rows, { orgId: "org-1", userId: "user-1" })).toBe(0);
  });

  test("bell polling from server load path matches router unreadCount query output", async () => {
    const rows = [
      { id: "n1", orgId: "org-1", userId: "user-1", readAt: null },
      { id: "n2", orgId: "org-1", userId: "user-1", readAt: new Date("2026-05-05T10:00:00Z") },
      { id: "n3", orgId: "org-1", userId: "user-1", readAt: null },
    ];
    const routerUnreadCount = async () => ({
      count: calculateUnreadNotificationCount(rows, { orgId: "org-1", userId: "user-1" }),
    });
    const serverLoadUnreadCount = calculateUnreadNotificationCount(rows, {
      orgId: "org-1",
      userId: "user-1",
    });
    const updates: number[] = [];
    const poll = new BellCounterPoll({
      realtimeEnabled: false,
      scheduler: {
        setInterval: () => 1,
        clearInterval: () => undefined,
      },
      unreadCount: routerUnreadCount,
      listUnread: async () => ({ items: [] }),
      markAllRead: async () => ({ count: 0 }),
      onCount: (count) => updates.push(count),
    });

    await poll.start();

    expect(updates).toEqual([serverLoadUnreadCount]);
    expect(serverLoadUnreadCount).toBe(2);
  });
});
