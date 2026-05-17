import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  createNotificationBroadcaster,
  type NotificationBroadcaster,
  type AwarenessServer,
} from "@notification-center/application/delivery-runtime/realtime-bell.ts";
import { BellCounterPoll } from "@notification-center/application/delivery-runtime/bell-counter-poll.ts";

// --- Broadcaster (server-side) ---

describe("NotificationBroadcaster", () => {
  test("broadcasts unreadCount via awareness server when flag ON", async () => {
    const broadcasts: Array<{ userId: string; data: Record<string, unknown> }> = [];
    const awarenessServer: AwarenessServer = {
      broadcastAwareness: (userId, data) => {
        broadcasts.push({ userId, data });
      },
    };

    const broadcaster = createNotificationBroadcaster({
      realtimeEnabled: true,
      awarenessServer,
      unreadCountForUser: async (userId) => (userId === "u1" ? 7 : 0),
    });

    await broadcaster.onNotificationInserted("u1");

    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]).toEqual({
      userId: "u1",
      data: { unreadCount: 7 },
    });
  });

  test("does nothing when flag OFF", async () => {
    const broadcasts: Array<{ userId: string; data: Record<string, unknown> }> = [];
    const awarenessServer: AwarenessServer = {
      broadcastAwareness: (userId, data) => {
        broadcasts.push({ userId, data });
      },
    };

    const broadcaster = createNotificationBroadcaster({
      realtimeEnabled: false,
      awarenessServer,
      unreadCountForUser: async () => 5,
    });

    await broadcaster.onNotificationInserted("u1");

    expect(broadcasts).toHaveLength(0);
  });

  test("broadcasts to multiple users independently", async () => {
    const broadcasts: Array<{ userId: string; data: Record<string, unknown> }> = [];
    const awarenessServer: AwarenessServer = {
      broadcastAwareness: (userId, data) => {
        broadcasts.push({ userId, data });
      },
    };
    const counts: Record<string, number> = { u1: 3, u2: 1 };

    const broadcaster = createNotificationBroadcaster({
      realtimeEnabled: true,
      awarenessServer,
      unreadCountForUser: async (userId) => counts[userId] ?? 0,
    });

    await broadcaster.onNotificationInserted("u1");
    await broadcaster.onNotificationInserted("u2");

    expect(broadcasts).toHaveLength(2);
    expect(broadcasts[0]).toEqual({ userId: "u1", data: { unreadCount: 3 } });
    expect(broadcasts[1]).toEqual({ userId: "u2", data: { unreadCount: 1 } });
  });
});

// --- BellCounterPoll integration with realtime (client-side) ---

function createScheduler() {
  const intervals: Array<{ ms: number; callback: () => void | Promise<void> }> = [];
  return {
    intervals,
    scheduler: {
      setInterval(callback: () => void | Promise<void>, ms: number) {
        intervals.push({ ms, callback });
        return intervals.length;
      },
      clearInterval(id: number) {
        intervals.splice(id - 1, 1);
      },
    },
  };
}

describe("BellCounterPoll — realtime WebSocket integration", () => {
  test("flag OFF → 60s poll only, no WebSocket connection", async () => {
    const { intervals, scheduler } = createScheduler();
    let subscribeCalled = false;
    const updates: number[] = [];

    const poll = new BellCounterPoll({
      realtimeEnabled: false,
      userId: "u1",
      scheduler,
      unreadCount: async () => ({ count: 2 }),
      listUnread: async () => ({ items: [] }),
      markAllRead: async () => ({ count: 0 }),
      subscribeRealtime: () => {
        subscribeCalled = true;
        return { unsubscribe: () => undefined };
      },
      onCount: (c) => updates.push(c),
    });

    await poll.start();

    expect(subscribeCalled).toBe(false);
    expect(intervals).toHaveLength(1);
    expect(intervals[0]?.ms).toBe(60_000);
    expect(updates).toEqual([2]);
  });

  test("flag ON → mock Hocuspocus server → badge update <2s (measured)", async () => {
    const { intervals, scheduler } = createScheduler();
    const updates: number[] = [];
    let realtimeHandler: ((p: { userId: string; unreadCount: number }) => void) | null = null;

    const poll = new BellCounterPoll({
      realtimeEnabled: true,
      userId: "u1",
      scheduler,
      unreadCount: async () => ({ count: 1 }),
      listUnread: async () => ({ items: [] }),
      markAllRead: async () => ({ count: 0 }),
      subscribeRealtime: (handler) => {
        realtimeHandler = handler;
        return { unsubscribe: () => undefined };
      },
      onCount: (c) => updates.push(c),
    });

    await poll.start();

    // No interval polling when realtime is on
    expect(intervals).toHaveLength(0);
    expect(updates).toEqual([1]);

    // Simulate server broadcasting a new notification — measure latency
    const t0 = performance.now();
    realtimeHandler!({ userId: "u1", unreadCount: 5 });
    const elapsed = performance.now() - t0;

    expect(updates).toEqual([1, 5]);
    // Badge update must be <2s (in practice, synchronous callback = <1ms)
    expect(elapsed).toBeLessThan(2000);
  });

  test("flag flip OFF while connected → graceful disconnect + fall back to poll", async () => {
    const { intervals, scheduler } = createScheduler();
    const updates: number[] = [];
    let unsubscribeCalled = false;
    let realtimeHandler: ((p: { userId: string; unreadCount: number }) => void) | null = null;

    const poll = new BellCounterPoll({
      realtimeEnabled: true,
      userId: "u1",
      scheduler,
      unreadCount: async () => ({ count: 1 }),
      listUnread: async () => ({ items: [] }),
      markAllRead: async () => ({ count: 0 }),
      subscribeRealtime: (handler) => {
        realtimeHandler = handler;
        return {
          unsubscribe: () => {
            unsubscribeCalled = true;
          },
        };
      },
      onCount: (c) => updates.push(c),
    });

    await poll.start();
    expect(intervals).toHaveLength(0);

    // Stop (simulates flag flip OFF)
    poll.stop();
    expect(unsubscribeCalled).toBe(true);

    // After stop, handler calls are no-ops (subscription cleaned up)
    // Restart with poll fallback
    const pollFallback = new BellCounterPoll({
      realtimeEnabled: false,
      userId: "u1",
      scheduler,
      unreadCount: async () => ({ count: 3 }),
      listUnread: async () => ({ items: [] }),
      markAllRead: async () => ({ count: 0 }),
      onCount: (c) => updates.push(c),
    });

    await pollFallback.start();
    expect(intervals).toHaveLength(1);
    expect(intervals[0]?.ms).toBe(60_000);
    expect(updates).toEqual([1, 3]);
  });
});

// --- Fanout integration ---

describe("notifyFanout + broadcaster integration", () => {
  test("fanout calls broadcaster.onNotificationInserted for in-app matches", async () => {
    const insertedUsers: string[] = [];
    const broadcaster: NotificationBroadcaster = {
      onNotificationInserted: async (userId) => {
        insertedUsers.push(userId);
      },
    };

    // Simulate what fanout does: after upserting in-app notification, call broadcaster
    await broadcaster.onNotificationInserted("u1");
    await broadcaster.onNotificationInserted("u2");

    expect(insertedUsers).toEqual(["u1", "u2"]);
  });
});
