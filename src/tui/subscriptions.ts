import type { EventEmitter } from "node:events";

export interface TuiSubscription {
  unsubscribe: () => void;
}

export class SubscriptionBridge {
  constructor(private readonly bus: EventEmitter) {}

  subscribe<TPayload>(
    eventName: string,
    callback: (payload: TPayload) => void,
  ): TuiSubscription {
    const listener = (payload: TPayload) => callback(payload);
    this.bus.on(eventName, listener);
    return {
      unsubscribe: () => {
        this.bus.off(eventName, listener);
      },
    };
  }
}
