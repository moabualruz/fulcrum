// Request-dispatch table for the fulcrum-indexer daemon.
// In PR 1 we only expose ping + shutdown. PR 2 wires ensureWatching /
// releaseWatching; PR 3 wires getStatus / triggerReindex. Keep this file
// deliberately thin — one function per method.
//
// See docs/plans/2026-04-18-001-refactor-indexer-daemon-plan.md Unit 1.3.

import type { IndexerErrorCode } from './protocol.js'

export interface DaemonContext {
  readonly version: string
  readonly startedAt: string
  activeWatches(): number
  /** Called by the shutdown handler — daemon main owns the actual teardown. */
  requestShutdown(): void
}

export type HandlerFn = (
  ctx: DaemonContext,
  params: Record<string, unknown>,
) => Promise<unknown> | unknown

export class HandlerError extends Error {
  constructor(
    public readonly code: IndexerErrorCode,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'HandlerError'
  }
}

// ── ping ───────────────────────────────────────────────────────────────────
// Lightweight liveness + identity probe. Clients use it both as a health
// check and as a cheap way to confirm the daemon finished startup before
// sending real work.

const ping: HandlerFn = (ctx) => ({
  ok: true,
  version: ctx.version,
  started_at: ctx.startedAt,
  active_watches: ctx.activeWatches(),
})

// ── shutdown ───────────────────────────────────────────────────────────────
// Cooperative shutdown. Caller receives { ok: true } then the daemon closes
// its listener and exits 0. Used by tests; real runs rely on SIGTERM or the
// idle timeout (PR 3).

const shutdown: HandlerFn = (ctx) => {
  // Defer the actual exit so we can flush the response first.
  setImmediate(() => ctx.requestShutdown())
  return { ok: true }
}

export const HANDLERS: Record<string, HandlerFn> = {
  ping,
  shutdown,
}

export function hasHandler(method: string): boolean {
  return Object.prototype.hasOwnProperty.call(HANDLERS, method)
}
