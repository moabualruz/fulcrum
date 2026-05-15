/**
 * SSE real-time push — gated by FULCRUM_FEATURES=real-time-collab-server.
 *
 * Publishes symphony state transitions to SSE subscribers.
 * Implements an in-process event bus; web layer mounts the SSE endpoint.
 */

export interface SseStateEvent {
  runId: string;
  fromState: string;
  toState: string;
  taskId: string;
  attempt: number;
  timestamp: string;
}

export type SseSubscriber = (event: SseStateEvent) => void;

/**
 * In-process SSE event bus. Orchestrator publishes; SSE endpoint subscribes.
 * When `real-time-collab-server` flag is OFF, publish is a no-op.
 */
export class SseEventBus {
  private subscribers = new Set<SseSubscriber>();

  subscribe(fn: SseSubscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  publish(event: SseStateEvent): void {
    for (const fn of this.subscribers) {
      fn(event);
    }
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }
}

/**
 * Format an SSE event for the wire (text/event-stream).
 * Channel: symphony:run:<runId>
 */
export function formatSseEvent(event: SseStateEvent): string {
  const data = JSON.stringify(event);
  return `event: symphony:run:${event.runId}\ndata: ${data}\n\n`;
}

/**
 * Create a ReadableStream that yields SSE events from the bus.
 * Caller should set Content-Type: text/event-stream.
 */
export function createSseStream(bus: SseEventBus): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      unsubscribe = bus.subscribe((event) => {
        try {
          controller.enqueue(encoder.encode(formatSseEvent(event)));
        } catch {
          // stream closed
        }
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });
}
