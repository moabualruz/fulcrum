// v2a PR 5 Task 25 — sanitizeOnWrite middleware composition.
//
// Composes the threat scanner + sanitization steps into a single entry-point
// the write path calls before anything else (per critical constraint #8 —
// sanitize MUST run before WAL).
//
// Failures are caught and surfaced as `sanitize_event=error` telemetry —
// content is written as-is so a sanitizer regression doesn't block all writes.

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
  content: string
  events: SanitizeEvent[]
  /** True if the sanitizer's internal logic threw — content is the raw input. */
  errored?: boolean
}

/**
 * Sanitize content on the write path. Always returns a result — never throws.
 * The returned `content` is what subsequent layers (WAL, L0, L1, L2) MUST use.
 */
export function sanitizeOnWrite(content: string, _meta: SanitizeMeta = {}): SanitizeResult {
  try {
    const result = scanForThreats(content)
    return { content: result.redacted, events: result.events }
  } catch (err) {
    return {
      content,
      events: [{ rule: 'sanitize.error', severity: 'error', match: (err as Error).message?.slice(0, 80) }],
      errored: true,
    }
  }
}

export { scanForThreats } from './threat-scanner.js'
export { sanitizeQuery } from './query.js'
export { wrapForRecall } from './wrap-for-recall.js'
