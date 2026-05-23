import { describe, expect, test } from "bun:test";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { MemoryEventBus } from "./memory-event-bus.ts";
import { resolveEventTransport } from "./event-bus.module.ts";

describe("MemoryEventBus", () => {
  test("emits, subscribes, and unsubscribes", async () => {
    const bus = new MemoryEventBus(new EventEmitter2());
    const received: unknown[] = [];
    const subscription = bus.subscribe("session.paused", (payload) => {
      received.push(payload);
    });

    await bus.emit("session.paused", { sessionId: "session-1" });
    bus.unsubscribe(subscription);
    await bus.emit("session.paused", { sessionId: "session-2" });

    expect(received).toEqual([{ sessionId: "session-1" }]);
  });

  test("resolves events transport feature flag", () => {
    expect(resolveEventTransport("events.transport:db-outbox")).toBe("db-outbox");
    expect(resolveEventTransport("events.transport:external")).toBe("external");
    expect(resolveEventTransport("public-api")).toBe("memory");
  });
});

