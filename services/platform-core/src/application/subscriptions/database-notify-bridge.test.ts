/**
 * Notify bridge unit tests.
 *
 * Uses a mock Notify to test LISTEN/NOTIFY → EventBus forwarding.
 * Also tests topicToPGChannel mapping.
 */

import { afterEach, describe, expect, test } from "bun:test";

import { EventBus, resetEventBus } from "./event-bus.ts";
import { emitNotify, startNotifyBridge, topicToPGChannel } from "./database-notify-bridge.ts";
import type { SubscriptionEvent } from "./event-bus.ts";

afterEach(() => resetEventBus());

// Mock notify client: captures listen registrations and provides a way to simulate NOTIFY.
function createMockNotifyClient() {
  const listeners = new Map<string, (payload: string) => void>();

  return {
    listen: async (channel: string, cb: (payload: string) => void) => {
      listeners.set(channel, cb);
      return () => {
        listeners.delete(channel);
      };
    },
    notify: async (channel: string, payload: string) => { listeners.get(channel)?.(payload); },

    // Test helper: simulate a NOTIFY.
    simulateNotify(channel: string, payload: string) {
      const cb = listeners.get(channel);
      if (cb) cb(payload);
    },
    getListenerCount() {
      return listeners.size;
    },
  };
}

describe("topicToPGChannel", () => {
  test("agent_run.abc → agent_run", () => {
    expect(topicToPGChannel("agent_run.abc123")).toBe("agent_run");
  });

  test("project.xyz.tasks → project_tasks", () => {
    expect(topicToPGChannel("project.xyz.tasks")).toBe("project_tasks");
  });

  test("org.xyz.notifications → org_notifications", () => {
    expect(topicToPGChannel("org.xyz.notifications")).toBe("org_notifications");
  });

  test("orchestration.xyz → orchestration", () => {
    expect(topicToPGChannel("orchestration.xyz")).toBe("orchestration");
  });

  test("unknown.topic → unknown_topic", () => {
    expect(topicToPGChannel("unknown.topic")).toBe("unknown_topic");
  });
});

describe("startNotifyBridge", () => {
  test("NOTIFY on agent_run channel → EventBus receives event", async () => {
    const bus = new EventBus();
    const client = createMockNotifyClient();
    const received: SubscriptionEvent[] = [];

    const topic = "agent_run.run123";
    bus.subscribe(topic, (evt) => received.push(evt));

    const teardown = await startNotifyBridge({
      client: client as any,
      eventBus: bus,
    });

    // Simulate notify with JSON payload.
    client.simulateNotify(
      "agent_run",
      JSON.stringify({ topic, data: { status: "running" } }),
    );

    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toEqual({ status: "running" });

    await teardown();
  });

  test("emitNotify publishes the same envelope shape consumed by bridge", async () => {
    const bus = new EventBus();
    const client = createMockNotifyClient();
    const received: SubscriptionEvent[] = [];
    const topic = "org.org-1.notifications";
    bus.subscribe(topic, (evt) => received.push(evt));

    const teardown = await startNotifyBridge({
      client: client as any,
      eventBus: bus,
    });

    await emitNotify(client, topic, { id: "notification-1" });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      topic,
      payload: { id: "notification-1" },
    });
    expect(received[0]!.timestamp).toBeInstanceOf(Date);

    await teardown();
  });

  test("bridge preserves envelope timestamps from PostgreSQL notify payloads", async () => {
    const bus = new EventBus();
    const client = createMockNotifyClient();
    const received: SubscriptionEvent[] = [];
    const topic = "agent_run.timestamped";
    bus.subscribe(topic, (evt) => received.push(evt));

    const teardown = await startNotifyBridge({
      client: client as any,
      eventBus: bus,
    });

    client.simulateNotify(
      "agent_run",
      JSON.stringify({ topic, payload: { status: "running" }, timestamp: "2026-05-18T01:00:00.000Z" }),
    );

    expect(received[0]!.payload).toEqual({ status: "running" });
    expect(received[0]!.timestamp.toISOString()).toBe("2026-05-18T01:00:00.000Z");

    await teardown();
  });

  test("non-JSON NOTIFY payload published raw", async () => {
    const bus = new EventBus();
    const client = createMockNotifyClient();
    const received: SubscriptionEvent[] = [];

    bus.subscribe("agent_run", (evt) => received.push(evt));

    const teardown = await startNotifyBridge({
      client: client as any,
      eventBus: bus,
    });

    client.simulateNotify("agent_run", "plain-text");

    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toBe("plain-text");

    await teardown();
  });

  test("teardown removes all notify listeners", async () => {
    const bus = new EventBus();
    const client = createMockNotifyClient();

    const teardown = await startNotifyBridge({
      client: client as any,
      eventBus: bus,
    });

    expect(client.getListenerCount()).toBeGreaterThan(0);

    await teardown();

    expect(client.getListenerCount()).toBe(0);
  });

  test("subscriber receives update within 500ms (simulated)", async () => {
    const bus = new EventBus();
    const client = createMockNotifyClient();

    const teardown = await startNotifyBridge({
      client: client as any,
      eventBus: bus,
    });

    const topic = "agent_run.timing-test";
    const receivedAt: number[] = [];
    bus.subscribe(topic, () => receivedAt.push(Date.now()));

    const sentAt = Date.now();
    client.simulateNotify(
      "agent_run",
      JSON.stringify({ topic, data: { ts: sentAt } }),
    );

    // In-process delivery is synchronous — well under 500ms.
    expect(receivedAt).toHaveLength(1);
    expect(receivedAt[0]! - sentAt).toBeLessThan(500);

    await teardown();
  });
});
