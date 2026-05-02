import { EventEmitter } from "node:events";

const RULES_CHANGED = "RoutingRulesChanged";

export class RoutingEventBus {
  private readonly emitter = new EventEmitter();

  onRulesChanged(handler: () => void): () => void {
    this.emitter.on(RULES_CHANGED, handler);
    return () => this.emitter.off(RULES_CHANGED, handler);
  }

  emitRulesChanged(): void {
    this.emitter.emit(RULES_CHANGED);
  }

  listenerCount(): number {
    return this.emitter.listenerCount(RULES_CHANGED);
  }
}
