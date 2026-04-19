// packages/memory/src/l1/consolidate-schedule.ts
//
// Memory v3 PR 8 unit 8.2 — scheduled consolidation pass.
//
// Wraps `findConsolidationCandidates` in a cadence-driven loop. When the
// resolved cadence is a known value (`hourly` | `daily`), a setTimeout chain
// fires the injected runPass callback and reschedules the next fire.
//
// Default post-PR-9 is `daily` — the "dormant during rollout" posture from
// Critical Constraint #6 was a safety net for in-flight sessions during
// PRs 0-8 and is no longer needed. Explicit opt-out values disable the
// schedule: `FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE=never`, `=off`, `=0`,
// `=false`, `=no`. Unknown strings (e.g. `weekly`, `7d`) also disable —
// typos must never silently fall back to daily.
//
// Dry-run only in PR 8. Curator-driven apply of merge candidates is
// deferred to the consolidation-prompt tuning PR (see 7.4 judgment
// call 8).

import type { AutoCurateScheduler } from './auto-curate.js'

export const CADENCE_MS: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
}

export interface ConsolidateScheduleOptions {
  /**
   * 'hourly' | 'daily' | 'never' | any unknown string | undefined.
   * When undefined, reads FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE; when that is
   * also unset or empty, defaults to 'daily' (post-PR-9 default-on).
   * Explicit opt-out values (`never`/`off`/`0`/`false`/`no`) and any string
   * not in the known cadence table disable scheduling (return a no-op
   * stop fn) — typos never silently fall back to daily.
   */
  cadence?: string
  /** Called once per scheduled tick. Return a summary (opaque to the scheduler). */
  runPass: () => Promise<unknown>
  /** Test hook. Defaults to global setTimeout/clearTimeout. */
  scheduler?: AutoCurateScheduler
  /** Called for any error raised by runPass. Default = swallow. */
  onError?: (err: Error) => void
}

const CONSOLIDATE_OFF_VALUES = new Set(['never', 'off', '0', 'false', 'no'])
const DEFAULT_CADENCE = 'daily'

function resolveCadence(explicit: string | undefined): string | undefined {
  const raw = explicit !== undefined
    ? explicit
    : process.env['FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE']
  if (raw === undefined || raw === '') return DEFAULT_CADENCE
  if (CONSOLIDATE_OFF_VALUES.has(raw.toLowerCase())) return undefined
  return raw
}

/**
 * Start the scheduled loop. Returns a stop fn that cancels the next tick
 * (an in-flight runPass is allowed to finish; onError catches if it throws).
 */
export function startConsolidateSchedule(options: ConsolidateScheduleOptions): () => void {
  const cadence = resolveCadence(options.cadence)
  const intervalMs = cadence ? CADENCE_MS[cadence] : undefined
  if (!intervalMs) return () => { /* disabled */ }

  const sched: AutoCurateScheduler = options.scheduler ?? {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  }

  let stopped = false
  let timer: unknown = undefined

  const schedule = (): void => {
    timer = sched.setTimeout(() => {
      timer = undefined
      void (async () => {
        try {
          await options.runPass()
        } catch (err) {
          options.onError?.(err instanceof Error ? err : new Error(String(err)))
        }
        if (!stopped) schedule()
      })()
    }, intervalMs)
  }

  schedule()

  return () => {
    stopped = true
    if (timer !== undefined) sched.clearTimeout(timer)
    timer = undefined
  }
}
