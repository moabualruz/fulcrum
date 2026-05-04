/**
 * In-process EventBus for subscription transport.
 *
 * P13#02: Zero-broker pub/sub. All three surfaces (Web via WS, CLI via JSON lines,
 * TUI via in-process EventEmitter bridge) consume this single EventBus.
 *
 * Topics:
 *   - agent_run.<id>   — live log lines + status changes
 *   - project.<id>.tasks — task mutation events
 *   - org.<id>.notifications — new notification events
 *   - orchestration.<orgId> — orchestrator state changes
 */

import { EventEmitter } from "node:events";

export interface SubscriptionEvent<T = unknown> {
  topic: string;
  payload: T;
  timestamp: Date;
}

export type EventHandler<T = unknown> = (event: SubscriptionEvent<T>) => void;

/**
 * Process-singleton EventBus.
 *
 * subscribe() returns an unsubscribe function. Calling it removes the listener.
 * No memory leak after subscribe/unsubscribe cycles — listeners are cleaned up
 * synchronously on unsubscribe().
 */
export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Allow many concurrent subscriptions without Node warning.
    this.emitter.setMaxListeners(0);
  }

  /**
   * Publish an event to a topic. All subscribers on that topic receive it.
   */
  publish<T>(topic: string, payload: T): void {
    const event: SubscriptionEvent<T> = {
      topic,
      payload,
      timestamp: new Date(),
    };
    this.emitter.emit(topic, event);
  }

  /**
   * Subscribe to a topic. Returns an unsubscribe function.
   */
  subscribe<T = unknown>(topic: string, handler: EventHandler<T>): () => void {
    this.emitter.on(topic, handler);
    return () => {
      this.emitter.removeListener(topic, handler);
    };
  }

  /**
   * Current listener count for a topic (test/debug helper).
   */
  listenerCount(topic: string): number {
    return this.emitter.listenerCount(topic);
  }

  /**
   * Remove all listeners (used in tests / shutdown).
   */
  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}

/** Process singleton */
let _instance: EventBus | null = null;

export function getEventBus(): EventBus {
  _instance ??= new EventBus();
  return _instance;
}

/**
 * Reset singleton (test-only).
 */
export function resetEventBus(): void {
  _instance?.removeAllListeners();
  _instance = null;
}
