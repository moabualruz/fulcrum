// packages/memory/src/l1/consolidate-log.ts
//
// Memory v3 PR 8 unit 8.2 — JSONL audit log for each scheduled
// consolidation scan. One line per pass, appended to
// `${vault}/curated/consolidate.log.md`. Kept separate from the curator
// log because consolidation passes are dry-run discovery — not curator
// writes — and mixing the two streams would muddle downstream tooling.

import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import type { ConsolidationCandidate } from './consolidate.js'

export interface ConsolidateLogEntry {
  ts: string
  workspace_id: string
  project_id?: string
  cadence: string
  min_confidence: number
  candidates_count: number
  duration_ms: number
  /** Full candidate snapshot for audit / lint diffing later. */
  candidates: ConsolidationCandidate[]
}

export function appendConsolidateLog(vaultRoot: string, entry: ConsolidateLogEntry): string {
  const logPath = join(vaultRoot, 'curated', 'consolidate.log.md')
  const dir = dirname(logPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  appendFileSync(logPath, JSON.stringify(entry) + '\n', { encoding: 'utf-8' })
  return logPath
}
