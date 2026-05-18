/**
 * In-process EventBus for subscription transport.
 *
 * Zero-broker pub/sub. All three surfaces consume this single EventBus.
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

export interface SerializedSubscriptionEvent<T = unknown> {
  topic: string;
  payload: T;
  timestamp: string;
}

export interface EventBusOptions {
  maxListenersPerTopic?: number;
}

const DEFAULT_MAX_LISTENERS_PER_TOPIC = 1_000;

/**
 * Process-singleton EventBus.
 *
 * subscribe() returns an unsubscribe function. Calling it removes the listener.
 * No memory leak after subscribe/unsubscribe cycles — listeners are cleaned up
 * synchronously on unsubscribe().
 */
export class EventBus {
  private readonly emitter = new EventEmitter();
  private readonly maxListenersPerTopic: number;

  constructor(options: EventBusOptions = {}) {
    this.maxListenersPerTopic = options.maxListenersPerTopic ?? DEFAULT_MAX_LISTENERS_PER_TOPIC;
    this.emitter.setMaxListeners(this.maxListenersPerTopic);
  }

  /**
   * Publish an event to a topic. All subscribers on that topic receive it.
   */
  publish<T>(topic: string, payload: T): void {
    this.publishEvent({
      topic,
      payload,
      timestamp: new Date(),
    });
  }

  publishEvent<T>(event: SubscriptionEvent<T>): void {
    this.emitter.emit(event.topic, event);
  }

  /**
   * Subscribe to a topic. Returns an unsubscribe function.
   */
  subscribe<T = unknown>(topic: string, handler: EventHandler<T>): () => void {
    if (this.emitter.listenerCount(topic) >= this.maxListenersPerTopic) {
      throw new Error(`subscription listener cap reached for topic: ${topic}`);
    }
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

export function serializeSubscriptionEvent<T>(event: SubscriptionEvent<T>): SerializedSubscriptionEvent<T> {
  return {
    topic: event.topic,
    payload: event.payload,
    timestamp: event.timestamp.toISOString(),
  };
}
