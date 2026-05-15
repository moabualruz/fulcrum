import { describe, expect, mock, test } from "bun:test";
import { SseEventBus, createSseStream, formatSseEvent, type SseStateEvent } from "./sse.ts";

const sampleEvent: SseStateEvent = {
  runId: "run-1",
  fromState: "claimed",
  toState: "running",
  taskId: "task-1",
  attempt: 1,
  timestamp: "2026-05-03T00:00:00Z",
};

describe("SSE event bus", () => {
  test("publish delivers to all subscribers", () => {
    const bus = new SseEventBus();
    const received: SseStateEvent[] = [];
    bus.subscribe((e) => received.push(e));
    bus.subscribe((e) => received.push(e));

    bus.publish(sampleEvent);
    expect(received).toHaveLength(2);
    expect(received[0]).toEqual(sampleEvent);
  });

  test("unsubscribe removes subscriber", () => {
    const bus = new SseEventBus();
    const received: SseStateEvent[] = [];
    const unsub = bus.subscribe((e) => received.push(e));
    expect(bus.subscriberCount).toBe(1);

    unsub();
    bus.publish(sampleEvent);
    expect(received).toHaveLength(0);
    expect(bus.subscriberCount).toBe(0);
  });

  test("no subscribers = no-op publish", () => {
    const bus = new SseEventBus();
    // Should not throw
    bus.publish(sampleEvent);
    expect(bus.subscriberCount).toBe(0);
  });
});

describe("SSE formatting", () => {
  test("formatSseEvent produces valid text/event-stream format", () => {
    const result = formatSseEvent(sampleEvent);
    expect(result).toContain("event: symphony:run:run-1");
    expect(result).toContain("data: ");
    expect(result).toEndWith("\n\n");

    // data line should be valid JSON
    const dataLine = result.split("\n").find((l) => l.startsWith("data: "));
    const parsed = JSON.parse(dataLine!.replace("data: ", ""));
    expect(parsed.runId).toBe("run-1");
    expect(parsed.fromState).toBe("claimed");
    expect(parsed.toState).toBe("running");
  });
});

describe("SSE stream", () => {
  test("createSseStream yields encoded events", async () => {
    const bus = new SseEventBus();
    const stream = createSseStream(bus);
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    // Publish after a tick so the stream is started
    setTimeout(() => {
      bus.publish(sampleEvent);
      // Cancel after receiving
      setTimeout(() => reader.cancel(), 10);
    }, 10);

    const { value, done } = await reader.read();
    expect(done).toBe(false);
    const text = decoder.decode(value);
    expect(text).toContain("symphony:run:run-1");
  });
});
