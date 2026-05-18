import type { EventEmitter } from "node:events";

export interface TuiSubscription {
  unsubscribe: () => void;
}

interface StreamEnvelope<TPayload> {
  id: string;
  type: string;
  traceId: string | null;
  timestamp: string;
  payload: TPayload;
}

export class SubscriptionBridge {
  constructor(private readonly bus: EventEmitter) {}

  subscribe<TPayload>(
    eventName: string,
    callback: (payload: TPayload) => void,
  ): TuiSubscription {
    const listener = (payload: TPayload | StreamEnvelope<TPayload>) => {
      callback(isStreamEnvelope(payload) ? payload.payload : payload);
    };
    this.bus.on(eventName, listener);
    return {
      unsubscribe: () => {
        this.bus.off(eventName, listener);
      },
    };
  }
}

function isStreamEnvelope<TPayload>(value: TPayload | StreamEnvelope<TPayload>): value is StreamEnvelope<TPayload> {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "type" in value &&
      "timestamp" in value &&
      "payload" in value,
  );
}
