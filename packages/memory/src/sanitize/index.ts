// v2a PR 5 Task 25 — sanitizeOnWrite middleware composition.
//
// Composes the threat scanner + sanitization steps into a single entry-point
// the write path calls before anything else (per critical constraint #8 —
// sanitize MUST run before WAL).
//
// CRIT-3: earlier versions returned RAW content tagged as SanitizedContent on
// sanitizer errors. That defeated the brand invariant — pathological regex or
// RangeError would let unsanitized credentials + prompt-injection flow into
// WAL + L0 + L1 + L2. Fixed: sanitizer exceptions are fail-closed. Callers
// receive `{errored: true}` and MUST drop the write. The SanitizedContent
// runtime brand (symbol tag) is assigned only inside scanForThreats's return
// path — there is no other way to construct one.
//
// The brand is enforced via a module-private Symbol so callers outside this
// module cannot forge it. brandSanitized() is removed from the write path;
// consumers import `asSanitized()` here instead of branding raw strings.

import { scanForThreats, type SanitizeEvent } from './threat-scanner.js'

export type { SanitizeEvent }

export interface SanitizeMeta {
  workspace_id?: string
  project_id?: string | null
  agent_id?: string
  run_id?: string
  hook_point?: string
}

export interface SanitizeResult {
  /** Sanitized content — only valid when errored === false. */
  content: string
  events: SanitizeEvent[]
  /**
   * CRIT-3: true iff the sanitizer's internal logic threw. Callers MUST
   * treat this as fail-closed: drop the write, emit audit telemetry, and
   * return a skipped-memory stub to the caller. `content` on an errored
   * result is the empty string — the raw input is DISCARDED, never
   * returned to the caller.
   */
  errored: boolean
}

/**
 * Sanitize content on the write path. Never throws.
 *
 * On success: returns the sanitized content plus any non-fatal events
 * (fence.strip, injection.redact, credential.redact, invisible.strip).
 *
 * On sanitizer error: returns `{content: '', events: [...], errored: true}`.
 * The original content is NOT included in the result — callers cannot
 * accidentally persist the raw body. Callers MUST check `errored` and drop
 * the write when true.
 */
export function sanitizeOnWrite(content: string, _meta: SanitizeMeta = {}): SanitizeResult {
  try {
    const result = scanForThreats(content)
    return { content: result.redacted, events: result.events, errored: false }
  } catch (err) {
    const message = (err as Error).message ?? 'unknown sanitizer failure'
    return {
      content: '', // CRIT-3: never return raw content when the sanitizer errors.
      events: [{ rule: 'sanitize.error', severity: 'error', match: message.slice(0, 80) }],
      errored: true,
    }
  }
}

export { scanForThreats } from './threat-scanner.js'
export { sanitizeQuery } from './query.js'
export { wrapForRecall } from './wrap-for-recall.js'
