export type EventBusHandler<TPayload = unknown> = (payload: TPayload) => void | Promise<void>;

export interface EventBusSubscription {
  unsubscribe(): void;
}

export interface EventBus {
  emit<TPayload = unknown>(eventName: string, payload: TPayload): Promise<void>;
  subscribe<TPayload = unknown>(eventName: string, handler: EventBusHandler<TPayload>): EventBusSubscription;
  unsubscribe(subscription: EventBusSubscription): void;
}

