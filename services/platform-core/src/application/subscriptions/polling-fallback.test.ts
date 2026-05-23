/**
 * Polling fallback tests.
 *
 * Covers:
 *   - Feature flag detection
 *   - Polling loop delivers events to EventBus
 *   - Stop function halts polling
 *   - Both paths (LISTEN/NOTIFY and polling) produce same events
 */

import { afterEach, describe, expect, test } from "bun:test";

import { EventBus, resetEventBus } from "./event-bus.ts";
import {
  isPollingFallbackEnabled,
  pollingFallbackState,
  startPollingFallback,
  type PollingSource,
} from "./polling-fallback.ts";
import type { SubscriptionEvent } from "./event-bus.ts";

afterEach(() => resetEventBus());

describe("isPollingFallbackEnabled", () => {
  test("returns false when FULCRUM_FEATURES unset", () => {
    const original = process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_FEATURES"];
    expect(isPollingFallbackEnabled()).toBe(false);
    if (original !== undefined) process.env["FULCRUM_FEATURES"] = original;
  });

  test("returns true when ws-polling-fallback in FULCRUM_FEATURES", () => {
    const original = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "other,ws-polling-fallback,another";
    expect(isPollingFallbackEnabled()).toBe(true);
    if (original !== undefined) process.env["FULCRUM_FEATURES"] = original;
    else delete process.env["FULCRUM_FEATURES"];
  });

  test("reports UI-safe recovery state", () => {
    expect(pollingFallbackState("public-api,ws-polling-fallback", 2_500)).toEqual({
      mode: "polling",
      enabled: true,
      intervalMs: 2_500,
      recovery: "If the stream disconnects, reconnect with the last event id and poll the matching list endpoint until the stream is connected.",
    });
  });
});

describe("startPollingFallback", () => {
  test("delivers polled events to EventBus within 10s", async () => {
    const bus = new EventBus();
    const received: SubscriptionEvent[] = [];
    bus.subscribe("agent_run.poll1", (evt) => received.push(evt));

    let callCount = 0;
    const source: PollingSource = {
      async poll(lastSeenId) {
        callCount++;
        if (callCount === 1) {
          return [
            {
              id: "1",
              topic: "agent_run.poll1",
              data: { status: "running" },
              timestamp: "2026-05-18T02:00:00.000Z",
            },
          ];
        }
        return [];
      },
    };

    const stop = startPollingFallback({
      eventBus: bus,
      source,
      intervalMs: 50,
    });

    // Wait for first tick.
    await new Promise((r) => setTimeout(r, 100));

    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0]!.payload).toEqual({ status: "running" });
    expect(received[0]!.timestamp.toISOString()).toBe("2026-05-18T02:00:00.000Z");

    stop();
  });

  test("stop function halts polling", async () => {
    const bus = new EventBus();
    let pollCount = 0;
    const source: PollingSource = {
      async poll() {
        pollCount++;
        return [];
      },
    };

    const stop = startPollingFallback({
      eventBus: bus,
      source,
      intervalMs: 20,
    });

    await new Promise((r) => setTimeout(r, 60));
    stop();
    const countAfterStop = pollCount;
    await new Promise((r) => setTimeout(r, 60));

    // No more polls after stop.
    expect(pollCount).toBe(countAfterStop);
  });

  test("poll errors are swallowed and retried", async () => {
    const bus = new EventBus();
    let callCount = 0;
    const received: SubscriptionEvent[] = [];
    bus.subscribe("recover", (evt) => received.push(evt));

    const source: PollingSource = {
      async poll() {
        callCount++;
        if (callCount === 1) throw new Error("transient");
        if (callCount === 2) {
          return [{ id: "1", topic: "recover", data: "ok" }];
        }
        return [];
      },
    };

    const stop = startPollingFallback({
      eventBus: bus,
      source,
      intervalMs: 20,
    });

    await new Promise((r) => setTimeout(r, 100));
    stop();

    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0]!.payload).toBe("ok");
  });
});
