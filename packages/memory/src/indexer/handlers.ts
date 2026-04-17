// Request-dispatch table for the fulcrum-indexer daemon.
// In PR 1 we only expose ping + shutdown. PR 2 wires ensureWatching /
// releaseWatching; PR 3 wires getStatus / triggerReindex. Keep this file
// deliberately thin — one function per method.
//
// See docs/plans/2026-04-18-001-refactor-indexer-daemon-plan.md Unit 1.3.

import { realpathSync } from 'node:fs'
import type { IndexerErrorCode } from './protocol.js'
import type { DaemonRegistry } from './registry.js'
import type { Db } from './types-db.js'

export interface DaemonContext {
  readonly version: string
  readonly startedAt: string
  activeWatches(): number
  /** Per-project registry of chokidar watchers. Wired in PR 2. */
  registry: DaemonRegistry
  /** Resolved SQLite handle for read-only status enrichment. Lazy so daemon
   * start doesn't require an open DB. Wired in PR 3 via handler registration. */
  getDb: () => Db | null
  /** Bump activity — idle-timer reset. Wired in PR 3. */
  bumpActivity: () => void
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

// ── getStatus ──────────────────────────────────────────────────────────────
// Returns a snapshot of every active project watch, enriched with current
// SQLite counts (code_chunks + memories scoped to the project). Read-only.

const getStatus: HandlerFn = (ctx) => {
  const snapshot = ctx.registry.getStatus()
  const db = ctx.getDb()
  const projects = snapshot.projects.map((p) => {
    let code_chunks_count = 0
    let memories_count = 0
    if (db) {
      try {
        const r1 = db.prepare('SELECT COUNT(*) AS n FROM code_chunks WHERE project_id = ?').get(p.project_id) as { n: number } | undefined
        code_chunks_count = r1?.n ?? 0
      } catch { /* table may be missing in a bootstrap daemon */ }
      try {
        const r2 = db.prepare('SELECT COUNT(*) AS n FROM memories WHERE project_id = ?').get(p.project_id) as { n: number } | undefined
        memories_count = r2?.n ?? 0
      } catch { /* ditto */ }
    }
    return { ...p, code_chunks_count, memories_count }
  })
  return {
    version: ctx.version,
    daemon_started_at: ctx.startedAt,
    active_watches: ctx.activeWatches(),
    projects,
  }
}

// ── triggerReindex ─────────────────────────────────────────────────────────
// One-shot full rescan of a project. Useful when the watcher missed events
// (polling-fallback filesystems) or the user wants to guarantee fresh chunks.
// Concurrent calls for the same root are deduped — second caller awaits the
// first in-flight promise and gets the same result.

const reindexInFlight = new Map<string, Promise<unknown>>()

const triggerReindex: HandlerFn = async (_ctx, params) => {
  const root = params['root']
  if (typeof root !== 'string' || root.length === 0 || (!root.startsWith('/') && !/^[A-Za-z]:\\/.test(root))) {
    throw new HandlerError('invalid_params', 'root must be an absolute filesystem path')
  }
  let realpath: string
  try { realpath = realpathSync(root) } catch { realpath = root }

  const existing = reindexInFlight.get(realpath)
  if (existing) return existing

  const promise = (async () => {
    const { ingestProject } = await import('../ingest.js')
    const { projectIdsFromPath } = await import('fulcrum-agent-core')
    const ids = projectIdsFromPath(realpath)
    const t0 = Date.now()
    const result = await ingestProject({
      workspace_id: ids.workspace_id,
      project_id:   ids.project_id,
      root_path:    realpath,
    })
    return {
      chunks_created:   result.chunks_created,
      memories_created: result.memories_created,
      errors:           (result.errors ?? []).length,
      took_ms:          Date.now() - t0,
    }
  })()

  reindexInFlight.set(realpath, promise)
  try { return await promise }
  finally { reindexInFlight.delete(realpath) }
}

export const HANDLERS: Record<string, HandlerFn> = {
  ping,
  shutdown,
  ensureWatching,
  releaseWatching,
  getStatus,
  triggerReindex,
}

/** Test helper — clears the in-flight dedup map between runs. */
export function _resetReindexStateForTest(): void {
  reindexInFlight.clear()
}

export function hasHandler(method: string): boolean {
  return Object.prototype.hasOwnProperty.call(HANDLERS, method)
}
