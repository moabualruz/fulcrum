import { existsSync, readFileSync } from 'node:fs'
import { telemetryPath, type RecallEvent } from './recall-telemetry.js'

// PR 3 R1 — measurement harness. Reads the telemetry JSONL under
// ${globalDataDir()}/telemetry/recall_bias.jsonl and aggregates per-session
// delta between recall calls and grep-without-recall. Callers (PR 3 unit 3.9
// writeup; `fulcrum install verify` in PR 13) compute the ≥20pp gate from these
// numbers.

export interface SessionStats {
  session_id: string
  grep_without_recall: number
  recall_called: number
  nudge_emitted: number
  passive_injection: number
  nudge_opt_out: number
  first_seen: string
  last_seen: string
}

export interface MeasurementSummary {
  total_events: number
  sessions: number
  grep_without_recall: number
  recall_called: number
  nudge_emitted: number
  passive_injection: number
  nudge_opt_out: number
  recall_rate: number      // recall_called / (recall_called + grep_without_recall)
  per_session: SessionStats[]
}

export function loadRecallEvents(path = telemetryPath()): RecallEvent[] {
  if (!existsSync(path)) return []
  const raw = readFileSync(path, 'utf8').trim()
  if (!raw) return []
  const events: RecallEvent[] = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    try { events.push(JSON.parse(line) as RecallEvent) } catch { /* skip malformed */ }
  }
  return events
}

export function summarizeRecallEvents(events: RecallEvent[]): MeasurementSummary {
  const perSession = new Map<string, SessionStats>()
  const totals = {
    grep_without_recall: 0,
    recall_called: 0,
    nudge_emitted: 0,
    passive_injection: 0,
    nudge_opt_out: 0,
  }

  for (const event of events) {
    const key = event.session_id
    let stats = perSession.get(key)
    if (!stats) {
      stats = {
        session_id: key,
        grep_without_recall: 0,
        recall_called: 0,
        nudge_emitted: 0,
        passive_injection: 0,
        nudge_opt_out: 0,
        first_seen: event.ts,
        last_seen: event.ts,
      }
      perSession.set(key, stats)
    }
    stats.last_seen = event.ts
    if (event.ts < stats.first_seen) stats.first_seen = event.ts
    switch (event.kind) {
      case 'grep_called_without_recall':
        stats.grep_without_recall++
        totals.grep_without_recall++
        break
      case 'recall_called':
        stats.recall_called++
        totals.recall_called++
        break
      case 'nudge_emitted':
        stats.nudge_emitted++
        totals.nudge_emitted++
        break
      case 'passive_injection':
        stats.passive_injection++
        totals.passive_injection++
        break
      case 'nudge_opt_out':
        stats.nudge_opt_out++
        totals.nudge_opt_out++
        break
    }
  }

  const denominator = totals.recall_called + totals.grep_without_recall
  const recallRate = denominator === 0 ? 0 : totals.recall_called / denominator

  return {
    total_events: events.length,
    sessions: perSession.size,
    ...totals,
    recall_rate: recallRate,
    per_session: Array.from(perSession.values()).sort(
      (a, b) => a.session_id.localeCompare(b.session_id),
    ),
  }
}

export function summarizeRecallTelemetry(path?: string): MeasurementSummary {
  return summarizeRecallEvents(loadRecallEvents(path))
}
