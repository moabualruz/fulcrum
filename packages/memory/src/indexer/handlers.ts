// Request-dispatch table for the fulcrum-indexer daemon.
// In PR 1 we only expose ping + shutdown. PR 2 wires ensureWatching /
// releaseWatching; PR 3 wires getStatus / triggerReindex. Keep this file
// deliberately thin — one function per method.
//
// See docs/plans/2026-04-18-001-refactor-indexer-daemon-plan.md Unit 1.3.

import type { IndexerErrorCode } from './protocol.js'
import type { DaemonRegistry } from './registry.js'

export interface DaemonContext {
  readonly version: string
  readonly startedAt: string
  activeWatches(): number
  /** Per-project registry of chokidar watchers. Wired in PR 2. */
  registry: DaemonRegistry
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

// ── ensureWatching / releaseWatching ───────────────────────────────────────

const ensureWatching: HandlerFn = (ctx, params) => {
  const root = params['root']
  if (typeof root !== 'string' || root.length === 0 || !root.startsWith('/') && !/^[A-Za-z]:\\/.test(root)) {
    // Accept POSIX absolute ('/...') or Windows drive ('C:\...'). Anything
    // else is an invalid input — callers must resolve relative paths.
    throw new HandlerError('invalid_params', 'root must be an absolute filesystem path')
  }
  return ctx.registry.ensureWatching(root)
}

const releaseWatching: HandlerFn = (ctx, params) => {
  const root = params['root']
  if (typeof root !== 'string' || root.length === 0) {
    throw new HandlerError('invalid_params', 'root must be a non-empty string')
  }
  return ctx.registry.releaseWatching(root)
}

export const HANDLERS: Record<string, HandlerFn> = {
  ping,
  shutdown,
  ensureWatching,
  releaseWatching,
}

export function hasHandler(method: string): boolean {
  return Object.prototype.hasOwnProperty.call(HANDLERS, method)
}
