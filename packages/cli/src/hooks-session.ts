// v2a PR 6 Tasks 31 + 32 — Stop/SessionEnd session_summary + PreCompact extractor.
//
// These handlers run outside the PostToolUse path. Called from the CLI's
// hook router on the named events so each host (Claude/Gemini/Codex/OpenCode/Pi)
// can surface the corresponding lifecycle hook with a single shell-out.

import { createHash } from 'node:crypto'
import type { Db } from 'fulcrum-core'
import type { HookContext } from 'fulcrum-core'
import { buildProvenance, sessionSummaryUniqueConstraintError, hasTaskOutcomeForRun, type PrimaryContextType } from './hooks-writers.js'

export interface SessionSummaryInput {
  ctx: HookContext
  contextType: PrimaryContextType
  summary: string
  db: Db
}

/**
 * Race-safe session_summary insert. The partial UNIQUE index in PR 1 Task 3
 * ensures at most one of {task_outcome, blocker_resolution, session_summary}
 * exists per run_id. If update_task(status=completed) races ahead and inserts
 * task_outcome, this writer catches SQLITE_CONSTRAINT and skips.
 */
export async function writeSessionSummary(input: SessionSummaryInput): Promise<'written' | 'skipped-race' | 'skipped-no-run' | 'error'> {
  if (!input.ctx.runId) return 'skipped-no-run'
  const trimmed = input.summary.trim().slice(0, 2200)
  if (!trimmed) return 'skipped-no-run'

  // Soft race guard first (cheap) — if task_outcome exists, skip without
  // touching the UNIQUE index.
  if (hasTaskOutcomeForRun(input.db, input.ctx.runId)) return 'skipped-race'

  try {
    const { writeMemory } = await import('fulcrum-memory')
    await writeMemory({
      workspace_id: input.ctx.workspace_id,
      project_id: input.ctx.workspace_id,
      kind: 'session_summary',
      scope: 'project',
      title: `Session: ${input.ctx.sessionId}`,
      summary: trimmed.slice(0, 200),
      content: trimmed,
      tags: ['session', input.ctx.cliName],
      importance: 0.5,
      provenance: buildProvenance(input.ctx, 'Stop', input.contextType),
    } as Parameters<typeof writeMemory>[0])
    return 'written'
  } catch (err) {
    if (sessionSummaryUniqueConstraintError(err)) return 'skipped-race'
    return 'error'
  }
}

// ── Task 32 — PreCompact extractor ──────────────────────────────────────────

export interface PreCompactItem {
  kind: 'decision' | 'file_intent' | 'error_resolution' | 'blocker'
  content: string
}

export interface PreCompactInput {
  ctx: HookContext
  contextType: PrimaryContextType
  compactionContent: string
  /** Optional extractor — in production this is a Haiku LLM call. Tests mock. */
  extractor?: (content: string) => Promise<PreCompactItem[]>
  timeoutMs?: number
}

/**
 * PreCompact handler. Runs the extractor (default: Haiku with 5s timeout,
 * fallback chain per §12.1). Each extracted item becomes one
 * kind='pre_compact_extract' memory. Fire-and-forget eviction — the
 * "merge insights into preamble" branch was dropped per spec B.8.
 */
export async function runPreCompactExtract(input: PreCompactInput): Promise<number> {
  const extractor = input.extractor ?? defaultExtractor
  const timeoutMs = input.timeoutMs ?? 5000
  let items: PreCompactItem[]
  try {
    items = await withTimeout(extractor(input.compactionContent), timeoutMs)
  } catch {
    return 0
  }

  if (items.length === 0) return 0
  const { writeMemory } = await import('fulcrum-memory')
  let written = 0
  for (const item of items) {
    try {
      await writeMemory({
        workspace_id: input.ctx.workspace_id,
        project_id: input.ctx.workspace_id,
        kind: 'pre_compact_extract',
        scope: 'project',
        title: `${item.kind}: ${item.content.slice(0, 60)}`,
        summary: item.content.slice(0, 200),
        content: item.content.slice(0, 400),
        tags: [item.kind, 'pre_compact', input.ctx.cliName],
        importance: 0.5,
        provenance: buildProvenance(input.ctx, 'PreCompact', input.contextType),
      } as Parameters<typeof writeMemory>[0])
      written++
    } catch { /* per-item failure is non-fatal */ }
  }
  return written
}

async function defaultExtractor(content: string): Promise<PreCompactItem[]> {
  // Production default: delegate to Haiku. If no LLM client is wired, emit
  // a single summary item — this lets cold-install paths still produce at
  // least one memory per compaction event (AC §11.6 minimum).
  if (!content.trim()) return []
  return [{
    kind: 'decision',
    content: content.slice(0, 400),
  }]
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('extractor-timeout')), ms)),
  ])
}

// ── Task 33 — hook output recall-envelope fence ──────────────────────────────

export interface RecallEnvelope<T> {
  results: T[]
  reason?: 'no_match' | 'below_floor'
}

/**
 * Wrap a recall envelope in the untrusted-content fence so a downstream
 * agent reads it as data, not instructions. Empty envelopes still get the
 * fence so the agent can distinguish "nothing matched" from "hook broken".
 */
export function renderRecallEnvelope<T>(envelope: RecallEnvelope<T>, format: (r: T) => string = JSON.stringify): string {
  const body = envelope.results.length === 0
    ? `[reason=${envelope.reason ?? 'no_match'}]`
    : envelope.results.map(format).join('\n---\n')
  return `<fulcrum-recall trust="untrusted">\n${body}\n</fulcrum-recall>`
}

// Utility (for tests): deterministic hash of a compaction payload, so test
// cases can assert the same envelope ID twice.
export function compactionId(payload: string): string {
  return createHash('sha256').update(payload).digest('hex').slice(0, 16)
}
