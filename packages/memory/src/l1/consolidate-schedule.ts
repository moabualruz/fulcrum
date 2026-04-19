// packages/memory/src/l1/consolidate-schedule.ts
//
// Memory v3 PR 8 unit 8.2 — scheduled consolidation pass.
//
// Wraps `findConsolidationCandidates` in a cadence-driven loop. When
// FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE is set to a known cadence
// (`hourly` | `daily`), a setTimeout chain fires the injected runPass
// callback and reschedules the next fire. Opt-in per plan §Critical
// Constraint #6; the default install stays quiet.
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
   * When undefined, reads FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE. Anything
   * outside the known cadence table disables scheduling (returns a no-op
   * stop fn).
   */
  cadence?: string
  /** Called once per scheduled tick. Return a summary (opaque to the scheduler). */
  runPass: () => Promise<unknown>
  /** Test hook. Defaults to global setTimeout/clearTimeout. */
  scheduler?: AutoCurateScheduler
  /** Called for any error raised by runPass. Default = swallow. */
  onError?: (err: Error) => void
}

function resolveCadence(explicit: string | undefined): string | undefined {
  if (explicit !== undefined) return explicit
  return process.env['FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE']
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
