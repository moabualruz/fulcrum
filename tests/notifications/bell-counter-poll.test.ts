import { describe, expect, test } from "bun:test";

import { BellCounterPoll } from "../../src/notifications/bell-counter-poll.ts";

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

describe("BellCounterPoll", () => {
  test("polls unread count on start and every 60 seconds when realtime is off", async () => {
    const { intervals, scheduler } = createScheduler();
    const updates: number[] = [];
    const counts = [2, 3];
    const poll = new BellCounterPoll({
      realtimeEnabled: false,
      scheduler,
      unreadCount: async () => ({ count: counts.shift() ?? 0 }),
      listUnread: async () => ({ items: [] }),
      markAllRead: async () => ({ count: 0 }),
      onCount: (count) => updates.push(count),
    });

    await poll.start();

    expect(updates).toEqual([2]);
    expect(intervals).toHaveLength(1);
    expect(intervals[0]?.ms).toBe(60_000);

    await intervals[0]?.callback();

    expect(updates).toEqual([2, 3]);
  });

  test("uses realtime unread-count updates instead of interval polling when realtime is on", async () => {
    const { intervals, scheduler } = createScheduler();
    const updates: number[] = [];
    let realtimeHandler: ((payload: { userId: string; unreadCount: number }) => void) | null = null;
    const poll = new BellCounterPoll({
      realtimeEnabled: true,
      userId: "user-1",
      scheduler,
      unreadCount: async () => ({ count: 1 }),
      listUnread: async () => ({ items: [] }),
      markAllRead: async () => ({ count: 0 }),
      subscribeRealtime: (handler) => {
        realtimeHandler = handler;
        return { unsubscribe: () => undefined };
      },
      onCount: (count) => updates.push(count),
    });

    await poll.start();
    realtimeHandler?.({ userId: "user-1", unreadCount: 4 });
    realtimeHandler?.({ userId: "other", unreadCount: 99 });

    expect(intervals).toHaveLength(0);
    expect(updates).toEqual([1, 4]);
  });

  test("loads top five unread items and clears badge when inbox is visited", async () => {
    const updates: number[] = [];
    const poll = new BellCounterPoll({
      realtimeEnabled: false,
      scheduler: createScheduler().scheduler,
      unreadCount: async () => ({ count: 5 }),
      listUnread: async (input) => ({
        items: Array.from({ length: input.limit }, (_, index) => ({
          id: `n-${index + 1}`,
          kind: "task",
          title: `Notification ${index + 1}`,
        })),
      }),
      markAllRead: async () => ({ count: 5 }),
      onCount: (count) => updates.push(count),
    });

    await poll.start();
    const unread = await poll.openDropdown();
    await poll.clearForInboxVisit();

    expect(unread.items).toHaveLength(5);
    expect(updates).toEqual([5, 0]);
  });
});
