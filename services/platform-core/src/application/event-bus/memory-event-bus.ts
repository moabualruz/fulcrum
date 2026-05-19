import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { EventBus, EventBusHandler, EventBusSubscription } from "./event-bus.ts";

@Injectable()
export class MemoryEventBus implements EventBus {
  constructor(private readonly emitter: EventEmitter2) {}

  async emit<TPayload = unknown>(eventName: string, payload: TPayload): Promise<void> {
    await this.emitter.emitAsync(eventName, payload);
  }

  subscribe<TPayload = unknown>(eventName: string, handler: EventBusHandler<TPayload>): EventBusSubscription {
    const listener = (payload: TPayload) => void handler(payload);
    this.emitter.on(eventName, listener);
    return {
      unsubscribe: () => this.emitter.off(eventName, listener),
    };
  }

  unsubscribe(subscription: EventBusSubscription): void {
    subscription.unsubscribe();
  }
}

