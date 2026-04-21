import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { globalDataDir } from './db/client.js'

// PR 3 R1 — telemetry stream for measurement spike. Every recall-related event
// appends one JSONL line to ${globalDataDir()}/telemetry/recall_bias.jsonl.
// Analysis harness (PR 3 unit 3.6) reads these lines to compute recall-vs-grep
// delta across the 2-week gate window.
//
// Append-only, crash-safe: if the file or directory doesn't exist, create it.
// If the write fails, swallow — telemetry must never block a hook or user turn.

export type RecallEventKind =
  | 'turn_observed'
  | 'recall_called'
  | 'grep_called_without_recall'
  | 'nudge_emitted'         // Variant A: advisory nudge sent to model
  | 'passive_injection'     // Variant B: silent recall prepended to tool output
  | 'nudge_opt_out'         // FULCRUM_NO_RECALL_NUDGE=1 observed

export interface RecallEvent {
  ts: string
  kind: RecallEventKind
  agent_type: string
  session_id: string
  turn_id?: string
  variant?: 'A' | 'B'
  tool_name?: string
  grep_count_without_recall?: number
  extra?: Record<string, unknown>
}

export function telemetryPath(): string {
  return join(globalDataDir(), 'telemetry', 'recall_bias.jsonl')
}

export function logRecallEvent(event: Omit<RecallEvent, 'ts'>): void {
  try {
    const path = telemetryPath()
    const dir = dirname(path)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n'
    appendFileSync(path, line, 'utf8')
  } catch {
    // Telemetry must never block. Swallow I/O errors silently.
  }
}
