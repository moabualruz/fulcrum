// packages/cli/src/commands/memory-consolidate.ts
//
// Memory v3 PR 7 unit 7.4 — `fulcrum memory consolidate` shim.
//
// Delegates to `findConsolidationCandidates` in fulcrum-memory. Dry-run is
// the only mode that ships in this unit — the curator-driven apply path
// lands when the consolidation prompt is tuned (follow-up).

import { getDb, projectIdsFromPath } from 'fulcrum-agent-core'
import {
  findConsolidationCandidates,
  type ConsolidationCandidate,
  type L1RetentionTier,
} from 'fulcrum-memory'

export interface ConsolidateInput {
  workspace_id?: string
  project_id?: string
  min_confidence?: number
  retention_tier?: L1RetentionTier
}

export interface ConsolidateResult {
  dry_run: true
  candidates: ConsolidationCandidate[]
}

export function consolidateMemory(input: ConsolidateInput = {}): ConsolidateResult {
  const ctx = projectIdsFromPath(process.cwd())
  const workspace_id = input.workspace_id ?? ctx.workspace_id
  const candidates = findConsolidationCandidates(getDb(), {
    workspace_id,
    ...(input.project_id ? { project_id: input.project_id } : {}),
    ...(input.min_confidence !== undefined ? { min_confidence: input.min_confidence } : {}),
    ...(input.retention_tier !== undefined ? { retention_tier: input.retention_tier } : {}),
  })
  return { dry_run: true, candidates }
}
