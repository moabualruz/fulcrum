/**
 * Polling fallback for WebSocket subscriptions.
 *
 * Enabled via FULCRUM_FEATURES=ws-polling-fallback.
 * Polls an event source at 5s intervals, publishing to EventBus.
 * Consumers see same events as LISTEN/NOTIFY path, within 10s.
 */

import type { EventBus } from "./event-bus.ts";

export interface PollingSource<T = unknown> {
  /** Fetch events newer than lastSeenId. Return [] when none. */
  poll(lastSeenId: string | null): Promise<Array<{ id: string; topic: string; data: T; timestamp?: Date | string }>>;
}

export interface PollingFallbackOptions {
  eventBus: EventBus;
  source: PollingSource;
  intervalMs?: number;
}

/**
 * Check whether ws-polling-fallback feature is enabled.
 */
export function isPollingFallbackEnabled(featuresEnv = process.env["FULCRUM_FEATURES"] ?? ""): boolean {
  const features = featuresEnv;
  return features.split(",").some((f) => f.trim() === "ws-polling-fallback");
}

export interface PollingFallbackState {
  mode: "polling";
  enabled: boolean;
  intervalMs: number;
  recovery: string;
}

export function pollingFallbackState(featuresEnv = process.env["FULCRUM_FEATURES"] ?? "", intervalMs = 5_000): PollingFallbackState {
  return {
    mode: "polling",
    enabled: isPollingFallbackEnabled(featuresEnv),
    intervalMs,
    recovery: "If the stream disconnects, reconnect with the last event id and poll the matching list endpoint until the stream is connected.",
  };
}

/**
 * Start polling loop. Returns a stop function.
 */
export function startPollingFallback(opts: PollingFallbackOptions): () => void {
  const { eventBus, source, intervalMs = 5_000 } = opts;
  let lastSeenId: string | null = null;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function tick() {
    if (stopped) return;
    try {
      const events = await source.poll(lastSeenId);
      for (const evt of events) {
        eventBus.publishEvent({
          topic: evt.topic,
          payload: evt.data,
          timestamp: evt.timestamp ? new Date(evt.timestamp) : new Date(),
        });
        lastSeenId = evt.id;
      }
    } catch {
      // Swallow poll errors; retry next tick.
    }
    if (!stopped) {
      timer = setTimeout(tick, intervalMs);
    }
  }

  // Start first tick immediately.
  tick();

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
  };
}
