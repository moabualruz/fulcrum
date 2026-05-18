/**
 * Subscription transport.
 *
 * Re-exports EventBus, database notify bridge, and polling fallback.
 */

export { EventBus, getEventBus, resetEventBus, serializeSubscriptionEvent } from "./event-bus.ts";
export type { EventHandler, SerializedSubscriptionEvent, SubscriptionEvent } from "./event-bus.ts";
export { startNotifyBridge, emitNotify, topicToPGChannel } from "./database-notify-bridge.ts";
export {
  isPollingFallbackEnabled,
  startPollingFallback,
} from "./polling-fallback.ts";
export type { PollingSource, PollingFallbackOptions } from "./polling-fallback.ts";
