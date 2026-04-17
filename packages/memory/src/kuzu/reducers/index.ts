// v2b PR 10 Task 1.5 — Graph reducer registry.
//
// Pure-function reducers transform Fulcrum event-bus events into Kuzu node/edge
// upserts. Reducers are isolated: one throwing never blocks others (prior art
// failure-isolation invariant). Errors emit `reducer_error` log lines.
//
// Registration pattern:
//   registerGraphReducer('task_created', taskReducer)
//
// Dispatch is synchronous — called by the dispatcher (Task 1.6) which owns
// batching + backpressure. Individual reducers never call Kuzu directly;
// they return UpsertNode[] | UpsertEdge[] which the dispatcher batches.

import type { EventType, EmitEventInput } from 'fulcrum-agent-core'

export interface UpsertNode {
  table: string
  id: string
  props: Record<string, unknown>
}

export interface UpsertEdge {
  table: string
  fromTable: string
  fromId: string
  toTable: string
  toId: string
  props?: Record<string, unknown>
}

export type GraphReducerResult = UpsertNode[] | UpsertEdge[]
export type GraphReducerFn = (event: EmitEventInput) => GraphReducerResult | void

const _registry = new Map<EventType, Set<GraphReducerFn>>()

/** Register a reducer function for a specific event type. Multiple reducers per type allowed. */
export function registerGraphReducer(type: EventType, fn: GraphReducerFn): void {
  if (!_registry.has(type)) _registry.set(type, new Set())
  _registry.get(type)!.add(fn)
}

/** Remove all registered reducers (for test isolation). */
export function clearGraphReducers(): void {
  _registry.clear()
}

/**
 * Dispatch an event to all registered reducers for its type.
 * Errors in individual reducers are caught and logged; they never propagate.
 */
export function dispatchToGraphReducers(event: EmitEventInput): GraphReducerResult[] {
  const type = event.evt_type as EventType
  const fns = _registry.get(type)
  if (!fns || fns.size === 0) return []

  const results: GraphReducerResult[] = []
  for (const fn of fns) {
    try {
      const result = fn(event)
      if (result) results.push(result)
    } catch (err) {
      // failure-isolation: log, never rethrow
      console.error(`[fulcrum] reducer_error event=${type} err=${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return results
}
