/**
 * EventBus unit tests.
 *
 * Covers:
 *   - publish/subscribe round-trip
 *   - unsubscribe removes listener cleanly
 *   - no memory leak after 1000 subscribe/unsubscribe cycles
 *   - multiple subscribers on same topic
 *   - isolated topics
 */

import { afterEach, describe, expect, test } from "bun:test";

import { EventBus, resetEventBus, serializeSubscriptionEvent } from "./event-bus.ts";
import type { SubscriptionEvent } from "./event-bus.ts";

afterEach(() => resetEventBus());

describe("EventBus", () => {
  test("publish → subscribe delivers event", () => {
    const bus = new EventBus();
    const received: SubscriptionEvent[] = [];

    bus.subscribe("test.topic", (evt) => received.push(evt));
    bus.publish("test.topic", { hello: "world" });

    expect(received).toHaveLength(1);
    expect(received[0]!.topic).toBe("test.topic");
    expect(received[0]!.id).toStartWith("test.topic:");
    expect(received[0]!.type).toBe("test.topic");
    expect(received[0]!.traceId).toBeNull();
    expect(received[0]!.payload).toEqual({ hello: "world" });
    expect(received[0]!.timestamp).toBeInstanceOf(Date);
  });

  test("unsubscribe removes listener", () => {
    const bus = new EventBus();
    const received: unknown[] = [];

    const unsub = bus.subscribe("x", (evt) => received.push(evt.payload));
    bus.publish("x", 1);
    unsub();
    bus.publish("x", 2);

    expect(received).toEqual([1]);
    expect(bus.listenerCount("x")).toBe(0);
  });

  test("no memory leak after 1000 subscribe/unsubscribe cycles", () => {
    const bus = new EventBus();

    for (let i = 0; i < 1_000; i++) {
      const unsub = bus.subscribe("leak.test", () => {});
      unsub();
    }

    expect(bus.listenerCount("leak.test")).toBe(0);
  });

  test("caps concurrent listeners per topic for backpressure", () => {
    const bus = new EventBus({ maxListenersPerTopic: 1 });
    bus.subscribe("capped", () => {});

    expect(() => bus.subscribe("capped", () => {})).toThrow("subscription listener cap reached");
  });

  test("multiple subscribers on same topic", () => {
    const bus = new EventBus();
    const a: unknown[] = [];
    const b: unknown[] = [];

    bus.subscribe("multi", (evt) => a.push(evt.payload));
    bus.subscribe("multi", (evt) => b.push(evt.payload));
    bus.publish("multi", "msg");

    expect(a).toEqual(["msg"]);
    expect(b).toEqual(["msg"]);
  });

  test("topics are isolated", () => {
    const bus = new EventBus();
    const received: unknown[] = [];

    bus.subscribe("topic.a", (evt) => received.push(evt.payload));
    bus.publish("topic.b", "wrong");

    expect(received).toHaveLength(0);
  });

  test("removeAllListeners clears everything", () => {
    const bus = new EventBus();
    bus.subscribe("a", () => {});
    bus.subscribe("b", () => {});
    bus.removeAllListeners();

    expect(bus.listenerCount("a")).toBe(0);
    expect(bus.listenerCount("b")).toBe(0);
  });

  test("serializes a stable transport event envelope", () => {
    expect(serializeSubscriptionEvent({
      id: "evt-1",
      topic: "agent_run.1",
      type: "agent_run.1",
      traceId: "trace-1",
      payload: { status: "running" },
      timestamp: new Date("2026-05-18T00:00:00.000Z"),
    })).toEqual({
      id: "evt-1",
      topic: "agent_run.1",
      type: "agent_run.1",
      traceId: "trace-1",
      payload: { status: "running" },
      timestamp: "2026-05-18T00:00:00.000Z",
    });
  });
});
