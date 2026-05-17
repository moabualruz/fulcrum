import type {
  EventHandler,
  SubscriptionEvent,
} from "@platform-core/application/subscriptions/event-bus.ts";

export type {
  EventHandler,
  SubscriptionEvent,
};

export async function subscribeToProcessEvent<T = unknown>(
  topic: string,
  handler: EventHandler<T>,
): Promise<() => void> {
  const { getEventBus } = await import("@platform-core/application/subscriptions/event-bus.ts");
  return getEventBus().subscribe<T>(topic, handler);
}
