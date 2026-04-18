// packages/memory/src/l1/telemetry.ts
//
// Memory v3 PR 3 unit 3.7 — curator telemetry (append-only audit log).
//
// Every curator run appends one JSON line to `${vault}/curated/log.md`.
// JSONL keeps the file grep-parseable AND Obsidian-readable (renders as a
// preformatted block). No rotation — this is an audit log; operators
// archive it manually if size ever becomes a concern.
//
// The schema is pinned. Adding a field is a non-breaking change; removing
// or renaming is breaking because downstream tooling (lint in PR 7.4,
// eval harness in PR 8) parses this file directly.

import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import type { CuratorBackendName, CuratorTask } from './curator.js'

export interface CuratorLogEntry {
  ts: string
  l0_id: string
  task: CuratorTask
  backend: CuratorBackendName
  model: string
  prompt_version: string
  duration_ms: number
  dry_run: boolean
  affected_pages: {
    created: string[]
    updated: string[]
    superseded: Array<{ old_id: string; new_id: string }>
  }
  new_edges: string[]
  confidence_deltas: {
    created: number[]
    updated: number[]
    superseded: number[]
  }
  usage?: {
    input_tokens?: number
    cached_input_tokens?: number
    output_tokens?: number
  }
}

/**
 * Append one JSONL record to `${vaultRoot}/curated/log.md`. Creates the
 * parent directory on first write. Safe to call many times concurrently —
 * Node's appendFileSync is atomic for buffer-sized writes on POSIX.
 */
export function appendCuratorLog(vaultRoot: string, entry: CuratorLogEntry): string {
  const logPath = join(vaultRoot, 'curated', 'log.md')
  const dir = dirname(logPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  appendFileSync(logPath, JSON.stringify(entry) + '\n', { encoding: 'utf-8' })
  return logPath
}
