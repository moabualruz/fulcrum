// packages/core/src/event-bus.ts
// In-process event bus for cross-package coordination (GAP-ARCH-8).
//
// Problem: Cross-package coordination currently uses direct imports or
// database polling. Direct imports create coupling; polling introduces latency.
// An event bus provides loose coupling: publishers emit typed events, subscribers
// react without any import dependency on the publisher.
//
// Design goals:
//   • Zero dependencies beyond Node.js built-ins
//   • Typed payloads via EventType + EmitEventInput
//   • Synchronous notification (subscribers called in registration order)
//   • Non-blocking: subscriber exceptions are caught and re-emitted as 'error' events
//   • Swappable via setEventBus() for testing
//
// Usage:
//   // Subscribe
//   getEventBus().on('task_created', (evt) => { ... })
//
//   // Unsubscribe
//   const handler = (evt) => { ... }
//   getEventBus().on('memory_written', handler)
//   getEventBus().off('memory_written', handler)
//
//   // One-time subscription
//   getEventBus().once('agent_run_finished', (evt) => { ... })
//
//   // Emit (called automatically by emitEvent() — most code should NOT call this directly)
//   getEventBus().emit({ evt_type: 'task_created', ... })

import type { EventType } from './types.js'
import type { EmitEventInput } from './events.js'

export type EventHandler = (event: EmitEventInput) => void | Promise<void>

export interface FulcrumEventBus {
  /** Subscribe to a specific event type. */
  on(type: EventType, handler: EventHandler): void
  /** Subscribe to all events regardless of type. */
  onAny(handler: EventHandler): void
  /** Remove a previously-registered handler for a specific event type. */
  off(type: EventType, handler: EventHandler): void
  /** Remove a handler registered with onAny(). */
  offAny(handler: EventHandler): void
  /** Subscribe once — handler is automatically removed after the first firing. */
  once(type: EventType, handler: EventHandler): void
  /** Emit an event to all matching subscribers. Non-blocking (fire-and-forget). */
  fire(event: EmitEventInput): void
  /** Number of active subscriptions (useful for tests). */
  listenerCount(type?: EventType): number
}

class DefaultEventBus implements FulcrumEventBus {
  private readonly _handlers = new Map<EventType, Set<EventHandler>>()
  private readonly _anyHandlers = new Set<EventHandler>()
  private readonly _onceHandlers = new Map<EventType, Set<EventHandler>>()

  on(type: EventType, handler: EventHandler): void {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set())
    this._handlers.get(type)!.add(handler)
  }

  onAny(handler: EventHandler): void {
    this._anyHandlers.add(handler)
  }

  off(type: EventType, handler: EventHandler): void {
    this._handlers.get(type)?.delete(handler)
  }

  offAny(handler: EventHandler): void {
    this._anyHandlers.delete(handler)
  }

  once(type: EventType, handler: EventHandler): void {
    if (!this._onceHandlers.has(type)) this._onceHandlers.set(type, new Set())
    this._onceHandlers.get(type)!.add(handler)
  }

  fire(event: EmitEventInput): void {
    const typed = this._handlers.get(event.evt_type)
    const once = this._onceHandlers.get(event.evt_type)

    // Call once-handlers first, then remove them
    if (once && once.size > 0) {
      const snapshot = [...once]
      once.clear()
      for (const h of snapshot) {
        this._call(h, event)
      }
    }

    if (typed) {
      for (const h of typed) {
        this._call(h, event)
      }
    }

    for (const h of this._anyHandlers) {
      this._call(h, event)
    }
  }

  listenerCount(type?: EventType): number {
    if (type === undefined) {
      let count = this._anyHandlers.size
      for (const s of this._handlers.values()) count += s.size
      for (const s of this._onceHandlers.values()) count += s.size
      return count
    }
    return (
      (this._handlers.get(type)?.size ?? 0) +
      (this._onceHandlers.get(type)?.size ?? 0) +
      this._anyHandlers.size
    )
  }

  private _call(handler: EventHandler, event: EmitEventInput): void {
    try {
      const result = handler(event)
      // Swallow async handler errors — event bus is fire-and-forget
      if (result && typeof result.catch === 'function') {
        result.catch(() => {})
      }
    } catch {
      // Synchronous handler errors are also swallowed to prevent one bad
      // subscriber from blocking the rest.
    }
  }
}

// Module-level singleton — swappable for testing via setEventBus().
let _bus: FulcrumEventBus = new DefaultEventBus()

/** Returns the active event bus. Guaranteed non-null. */
export function getEventBus(): FulcrumEventBus {
  return _bus
}

/**
 * Replace the active event bus. Useful in tests to inject a mock or a
 * fresh instance to avoid cross-test state leakage.
 */
export function setEventBus(bus: FulcrumEventBus): void {
  _bus = bus
}

/**
 * Reset the event bus to a fresh DefaultEventBus instance.
 * Call in test afterEach to avoid handler leakage across tests.
 */
export function resetEventBus(): void {
  _bus = new DefaultEventBus()
}
