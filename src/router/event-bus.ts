import { EventEmitter } from "node:events";

const RULES_CHANGED = "RoutingRulesChanged";

export class RoutingEventBus {
  private readonly emitter = new EventEmitter();

  onRulesChanged(handler: () => void): () => void {
    this.emitter.on(RULES_CHANGED, handler);
    return () => this.emitter.off(RULES_CHANGED, handler);
  }

  emitRulesChanged(): void {
    for (const listener of this.emitter.listeners(RULES_CHANGED)) {
      try {
        (listener as () => void)();
      } catch (error) {
        console.error(
          `Routing rules change listener failed: ${String(
            (error as { message?: unknown }).message ?? error,
          )}`,
        );
      }
    }
  }

  listenerCount(): number {
    return this.emitter.listenerCount(RULES_CHANGED);
  }
}

export const routingEventBus = new RoutingEventBus();
