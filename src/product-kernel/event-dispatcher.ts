/**
 * EventDispatcher — unified event entry point (ARCH-04).
 *
 * Persist-and-publish in one call:
 *   1. Writes event row to DB via appendEvent() (ULID PK)
 *   2. Publishes to in-memory subscribers for real-time reactions
 *
 * Replaces direct appendEvent() calls across the codebase.
 * All event emission flows through dispatch().
 */
import { EventEmitter } from "node:events";
import type { ProductDb } from "./db/types.ts";
import type { EntityManager } from "@mikro-orm/postgresql";
import {
  appendEvent as rawAppendEvent,
  type AppendEventInput,
  type EventRow,
  type DbHandle,
} from "./store/repositories.ts";

// ---------------------------------------------------------------------------
// Subscription types
// ---------------------------------------------------------------------------

export type EventHandler = (event: EventRow) => void | Promise<void>;

export interface EventFilter {
  /** Match events with this subject_kind (e.g. "task", "project", "sprint"). */
  subjectKind?: string;
  /** Match events with this verb (e.g. "created", "closed"). */
  verb?: string;
  /** Match events in this org. */
  orgId?: string;
}

// ---------------------------------------------------------------------------
// EventDispatcher
// ---------------------------------------------------------------------------

const ALL_EVENTS = "event:*";

function filterKey(filter: EventFilter): string {
  const parts: string[] = [];
  if (filter.subjectKind) parts.push(`sk:${filter.subjectKind}`);
  if (filter.verb) parts.push(`v:${filter.verb}`);
  if (filter.orgId) parts.push(`o:${filter.orgId}`);
  return parts.length > 0 ? parts.join("|") : ALL_EVENTS;
}

export class EventDispatcher {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Allow many listeners — event-driven systems accumulate subscribers
    this.emitter.setMaxListeners(100);
  }

  // ── Core: persist + publish ──────────────────────────────────────────

  /**
   * Single entry point for all event emission.
   * Persists to DB, then publishes to in-memory subscribers.
   */
  async dispatch(db: DbHandle, input: AppendEventInput): Promise<EventRow> {
    const event = await rawAppendEvent(db, input);
    this.publish(event);
    return event;
  }

  // ── Publish (in-memory only, for testing or pre-persisted events) ────

  publish(event: EventRow): void {
    // Fire wildcard listeners
    this.safeEmit(ALL_EVENTS, event);

    // Fire filtered listeners for each matching dimension
    const keys = new Set<string>();
    if (event.subject_kind) keys.add(filterKey({ subjectKind: event.subject_kind }));
    if (event.verb) keys.add(filterKey({ verb: event.verb }));
    if (event.org_id) keys.add(filterKey({ orgId: event.org_id }));
    // Compound keys
    if (event.subject_kind && event.verb) {
      keys.add(filterKey({ subjectKind: event.subject_kind, verb: event.verb }));
    }
    for (const key of keys) {
      this.safeEmit(key, event);
    }
  }

  // ── Subscribe ────────────────────────────────────────────────────────

  /**
   * Subscribe to events matching the filter (or all events if no filter).
   * Returns an unsubscribe function.
   */
  on(handler: EventHandler, filter?: EventFilter): () => void {
    const key = filter ? filterKey(filter) : ALL_EVENTS;
    const wrapped = this.wrapHandler(key, handler);
    this.emitter.on(key, wrapped);
    return () => {
      this.emitter.off(key, wrapped);
    };
  }

  /**
   * Subscribe to a single matching event, then auto-unsubscribe.
   */
  once(handler: EventHandler, filter?: EventFilter): () => void {
    const key = filter ? filterKey(filter) : ALL_EVENTS;
    const wrapped = this.wrapHandler(key, handler);
    this.emitter.once(key, wrapped);
    return () => {
      this.emitter.off(key, wrapped);
    };
  }

  // ── Diagnostics ──────────────────────────────────────────────────────

  listenerCount(filter?: EventFilter): number {
    const key = filter ? filterKey(filter) : ALL_EVENTS;
    return this.emitter.listenerCount(key);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }

  // ── Internal ─────────────────────────────────────────────────────────

  private safeEmit(key: string, event: EventRow): void {
    // Use emit() so EventEmitter's once() bookkeeping works correctly.
    // Wrap each listener at registration time instead — but we can't
    // retroactively wrap here. Instead, rely on an error-boundary
    // wrapper installed via a global handler.
    //
    // Simplest correct approach: snapshot listeners, call them manually,
    // but remove once-listeners ourselves.
    //
    // Actually the cleanest fix: just use emit() with a top-level
    // error event handler. Node EventEmitter throws on 'error' events
    // if no listener, but we handle that.
    try {
      this.emitter.emit(key, event);
    } catch {
      // Individual handler errors are caught by the safe wrappers below
    }
  }

  /** Wrap a handler to be error-safe (swallow sync + async errors). */
  private wrapHandler(key: string, handler: EventHandler): EventHandler {
    return (event: EventRow) => {
      try {
        const result = handler(event);
        if (result && typeof (result as Promise<void>).catch === "function") {
          (result as Promise<void>).catch((err) => {
            console.error(
              `[EventDispatcher] async handler error on "${key}": ${String(
                (err as { message?: unknown }).message ?? err,
              )}`,
            );
          });
        }
      } catch (err) {
        console.error(
          `[EventDispatcher] handler error on "${key}": ${String(
            (err as { message?: unknown }).message ?? err,
          )}`,
        );
      }
    };
  }
}

// ---------------------------------------------------------------------------
// Process singleton — import this wherever you need to dispatch events
// ---------------------------------------------------------------------------

export const eventDispatcher = new EventDispatcher();
