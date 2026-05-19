/**
 * Subscription procedure tests.
 *
 * Verifies that tRPC subscription procedures integrate with EventBus:
 *   - runs.onRunUpdate(runId) receives events on agent_run.<runId>
 *   - notify.onNewNotification() receives events on org.<orgId>.notifications
 *   - orchestration.onStateChange() receives events on orchestration.<orgId>
 *   - Disconnect path: unsubscribe() removes listener cleanly
 */

import { afterEach, describe, expect, test } from "bun:test";

import { getEventBus, resetEventBus } from "@platform-core/application/subscriptions/event-bus.ts";
import {
  runsSubscriptionRouter,
  notifySubscriptionRouter,
  orchestrationSubscriptionRouter,
  type RunUpdatePayload,
  type NotificationPayload,
  type OrchestrationStatePayload,
  type RunUpdateEvent,
  type NotificationEvent,
  type OrchestrationStateEvent,
} from "./subscriptions.ts";

afterEach(() => resetEventBus());

function makeCtx(orgId: string) {
  return {
    session: { id: "s1" } as any,
    orgId,
    userId: "user1",
    em: null,
    container: null,
    requestId: null,
    responseHeaders: null,
  };
}

describe("runsSubscriptionRouter.onRunUpdate", () => {
  test("reports connection status and polling recovery metadata", async () => {
    const original = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "ws-polling-fallback";

    const status = await runsSubscriptionRouter
      .createCaller(makeCtx("org1"))
      .status({ runId: "run-abc" });

    expect(status).toEqual({
      connected: true,
      topic: "agent_run.run-abc",
      transport: "event-bus",
      fallback: {
        mode: "polling",
        enabled: true,
        intervalMs: 5_000,
        recovery: "If the stream disconnects, reconnect with the last event id and poll the matching list endpoint until the stream is connected.",
      },
    });

    if (original === undefined) delete process.env["FULCRUM_FEATURES"];
    else process.env["FULCRUM_FEATURES"] = original;
  });

  test("receives events published to agent_run.<runId>", async () => {
    const bus = getEventBus();
    const runId = "run-abc";
    const received: RunUpdateEvent[] = [];

    const obs = await runsSubscriptionRouter
      .createCaller(makeCtx("org1"))
      .onRunUpdate({ runId });

    // tRPC v11 createCaller returns a Promise<Observable>
    const sub = obs.subscribe({
      next(event: RunUpdateEvent) {
        received.push(event);
      },
    });

    await new Promise((r) => setTimeout(r, 10));

    bus.publish(`agent_run.${runId}`, {
      runId,
      status: "running",
      timestamp: new Date(),
    } satisfies RunUpdatePayload);

    bus.publish(`agent_run.${runId}`, {
      runId,
      status: "completed",
      timestamp: new Date(),
    } satisfies RunUpdatePayload);

    await new Promise((r) => setTimeout(r, 10));
    sub.unsubscribe();

    expect(received).toHaveLength(2);
    expect(received[0]!).toMatchObject({
      topic: `agent_run.${runId}`,
      type: `agent_run.${runId}`,
      traceId: null,
      payload: { status: "running" },
    });
    expect(received[1]!.payload.status).toBe("completed");
    expect(new Date(received[0]!.timestamp).toString()).not.toBe("Invalid Date");
  });
});

describe("notifySubscriptionRouter.onNewNotification", () => {
  test("reports notification stream status for current org", async () => {
    const status = await notifySubscriptionRouter
      .createCaller(makeCtx("org-xyz"))
      .status();

    expect(status).toMatchObject({
      connected: true,
      topic: "org.org-xyz.notifications",
      transport: "event-bus",
      fallback: { mode: "polling", intervalMs: 5_000 },
    });
  });

  test("receives events published to org.<orgId>.notifications", async () => {
    const bus = getEventBus();
    const orgId = "org-xyz";
    const received: NotificationEvent[] = [];

    const obs = await notifySubscriptionRouter
      .createCaller(makeCtx(orgId))
      .onNewNotification();

    const sub = obs.subscribe({
      next(event: NotificationEvent) {
        received.push(event);
      },
    });

    await new Promise((r) => setTimeout(r, 10));

    bus.publish(`org.${orgId}.notifications`, {
      id: "notif-1",
      title: "New task assigned",
      timestamp: new Date(),
    } satisfies NotificationPayload);

    await new Promise((r) => setTimeout(r, 10));
    sub.unsubscribe();

    expect(received).toHaveLength(1);
    expect(received[0]!.payload.title).toBe("New task assigned");
    expect(received[0]!.topic).toBe(`org.${orgId}.notifications`);
  });
});

describe("orchestrationSubscriptionRouter.onStateChange", () => {
  test("receives events published to orchestration.<orgId>", async () => {
    const bus = getEventBus();
    const orgId = "org-orch";
    const received: OrchestrationStateEvent[] = [];

    const obs = await orchestrationSubscriptionRouter
      .createCaller(makeCtx(orgId))
      .onStateChange();

    const sub = obs.subscribe({
      next(event: OrchestrationStateEvent) {
        received.push(event);
      },
    });

    await new Promise((r) => setTimeout(r, 10));

    bus.publish(`orchestration.${orgId}`, {
      runId: "run-1",
      state: "running",
      previousState: "queued",
      timestamp: new Date(),
    } satisfies OrchestrationStatePayload);

    await new Promise((r) => setTimeout(r, 10));
    sub.unsubscribe();

    expect(received).toHaveLength(1);
    expect(received[0]!.payload.state).toBe("running");
    expect(received[0]!.topic).toBe(`orchestration.${orgId}`);
  });
});

describe("disconnect path", () => {
  test("unsubscribe removes EventBus listener", () => {
    const bus = getEventBus();
    const topic = "agent_run.disconnect-test";

    const unsub = bus.subscribe(topic, () => {});
    expect(bus.listenerCount(topic)).toBe(1);

    unsub();
    expect(bus.listenerCount(topic)).toBe(0);
  });

  test("1000 subscribe/unsubscribe cycles — no leak", () => {
    const bus = getEventBus();
    const topic = "agent_run.leak-test";

    for (let i = 0; i < 1_000; i++) {
      const unsub = bus.subscribe(topic, () => {});
      unsub();
    }

    expect(bus.listenerCount(topic)).toBe(0);
  });
});
