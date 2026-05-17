/**
 * Subscription transport.
 *
 * Re-exports EventBus, database notify bridge, and polling fallback.
 */

export { EventBus, getEventBus, resetEventBus } from "./event-bus.ts";
export type { SubscriptionEvent, EventHandler } from "./event-bus.ts";
export { startNotifyBridge, emitNotify, topicToPGChannel } from "./database-notify-bridge.ts";
export {
  isPollingFallbackEnabled,
  startPollingFallback,
} from "./polling-fallback.ts";
export type { PollingSource, PollingFallbackOptions } from "./polling-fallback.ts";
