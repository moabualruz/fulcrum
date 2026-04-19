// packages/memory/src/l1/auto-curate.ts
//
// Memory v3 PR 8 unit 8.1 — auto-curator.
//
// Subscribes to the ContentChangeBus and, when enabled, fires the curator
// on each newly observed L0 raw file after a configurable debounce (default
// 30s per plan §8.1). Opt-in via FULCRUM_MEMORY_CURATE_AUTO=1 so the default
// install stays manual (Critical Constraint #6).
//
// Why a bus subscription and not a direct chokidar mount: the vault watcher
// already emits `{ kind: 'l0_raw', change_type: 'add' }` on the unified bus
// (PR 1 unit 1.3). Routing through the bus keeps the watcher as the single
// filesystem owner and lets tests fire events directly with no real IO.

import { getContentChangeBus, type ContentChangeBus, type ContentChangeEvent } from 'fulcrum-agent-core'

export const DEFAULT_AUTO_CURATE_DEBOUNCE_MS = 30_000

/**
 * Injectable scheduler so tests can run synchronously under fake time.
 * The real-time shape mirrors Node's global `setTimeout` / `clearTimeout`.
 */
export interface AutoCurateScheduler {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export interface AutoCurateOptions {
  /**
   * When true, subscribe unconditionally. When false, never subscribe. When
   * undefined, fall back to `process.env.FULCRUM_MEMORY_CURATE_AUTO === '1'`.
   * Explicit false wins over the env to keep tests deterministic.
   */
  enabled?: boolean
  /** Debounce per l0_id before the curator fires. Default 30_000. */
  debounceMs?: number
  /** Async callback that runs the curator for one L0 source. */
  curate: (l0_id: string) => Promise<unknown>
  /** Test hook; defaults to getContentChangeBus(). */
  bus?: ContentChangeBus
  /** Test hook; defaults to global setTimeout/clearTimeout. */
  scheduler?: AutoCurateScheduler
  /** Callback for curate-path errors. Default = swallow. */
  onError?: (err: Error, l0_id: string) => void
}

// L0 IDs are `l0src_<26-char Crockford base32 ULID>` per newId('l0_source').
const L0_ID_RE = /^l0src_[0-9A-HJKMNP-TV-Z]{26}$/

function extractL0Id(path: string): string | null {
  // Accept both POSIX and Windows-style separators just in case.
  const normalized = path.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  const basename = slash >= 0 ? normalized.slice(slash + 1) : normalized
  if (!basename.endsWith('.md')) return null
  const id = basename.slice(0, -3)
  if (!L0_ID_RE.test(id)) return null
  return id
}

function resolveEnabled(explicit: boolean | undefined): boolean {
  if (explicit === true) return true
  if (explicit === false) return false
  return process.env['FULCRUM_MEMORY_CURATE_AUTO'] === '1'
}

/**
 * Start subscribing for auto-curation. Returns a stop function that unbinds
 * the bus handler and clears all pending debounce timers. Safe to call
 * multiple times (each call sets up an independent subscription).
 */
export function startAutoCurator(options: AutoCurateOptions): () => void {
  if (!resolveEnabled(options.enabled)) return () => { /* disabled */ }

  const bus = options.bus ?? getContentChangeBus()
  const sched: AutoCurateScheduler = options.scheduler ?? {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  }
  const debounceMs = options.debounceMs ?? DEFAULT_AUTO_CURATE_DEBOUNCE_MS

  const pending = new Map<string, unknown>()

  const handler = (evt: ContentChangeEvent): void => {
    if (evt.kind !== 'l0_raw') return
    if (evt.change_type !== 'add') return

    const l0_id = extractL0Id(evt.path)
    if (!l0_id) return

    const existing = pending.get(l0_id)
    if (existing !== undefined) sched.clearTimeout(existing)

    const timer = sched.setTimeout(() => {
      pending.delete(l0_id)
      void (async () => {
        try {
          await options.curate(l0_id)
        } catch (err) {
          options.onError?.(err instanceof Error ? err : new Error(String(err)), l0_id)
        }
      })()
    }, debounceMs)

    pending.set(l0_id, timer)
  }

  bus.on(handler)

  return () => {
    bus.off(handler)
    for (const t of pending.values()) sched.clearTimeout(t)
    pending.clear()
  }
}
