// v2a PR 2 Task 10 — staged retrieval pipeline.
//
// Orchestrates the v2a retrieval contract on top of the existing recall.ts
// implementation: parallel FTS5 + vec lookup, RRF fusion (k=60) via scoring.ts,
// optional MMR diversity rerank, and the {results, reason?} envelope per the
// plan's pre-resolved decision #5.
//
// The module is intentionally thin: heavy retrieval logic stays in recall.ts
// where the L1/L2 path branching is already battle-tested. This wrapper adds
// the envelope semantics + per-query min_score floor + the recall_events
// ledger insertion that v2b PR 11's Dreaming consumes.

import type { Db } from 'fulcrum-agent-core'
import { getDb } from 'fulcrum-agent-core'
import { recallMemory } from '../recall.js'
import type { CompactMemory, FullMemory, RecallMemoryInput } from '../types.js'

export type StagedSearchReason = 'no_match' | 'below_floor'

export interface StagedSearchResponse<T = CompactMemory | FullMemory> {
  results: T[]
  reason?: StagedSearchReason
}

export interface RunStagedSearchInput extends RecallMemoryInput {
  /**
   * Score floor in [0, 1]. Results below the floor are dropped; if no result
   * survives, the response carries `reason: 'below_floor'`. Default per plan:
   * 0.35 for semantic queries (mode='total_ranked' / inferred), 0 for FTS-only.
   */
  min_score?: number
  /** Optional caller hint — recorded in memory_recall_events for utility scoring. */
  caller_run_id?: string
  /** Optional caller hint — recorded in memory_recall_events for utility scoring. */
  caller_role?: string
  /** Source string for memory_recall_events. Default: 'recall_memory'. */
  recall_source?: string
}

const DEFAULT_SEMANTIC_MIN_SCORE = 0.35
const DEFAULT_FTS_MIN_SCORE = 0

function inferDefaultMinScore(input: RecallMemoryInput): number {
  // Heuristic: any non-trivial query that wouldn't be served by FTS-only gets
  // the semantic floor. Single-token queries fall to FTS-only.
  const tokens = input.query.trim().split(/\s+/).filter(Boolean)
  return tokens.length <= 1 ? DEFAULT_FTS_MIN_SCORE : DEFAULT_SEMANTIC_MIN_SCORE
}

function getScore(item: CompactMemory | FullMemory): number {
  if ('recall_score' in item && typeof item.recall_score === 'number') return item.recall_score
  if ('score' in item && typeof item.score === 'number') return item.score
  return 0
}

function logRecallEvent(db: Db, params: {
  memory_id: string
  query: string
  score: number
  rank: number
  caller_run_id?: string
  caller_role?: string
  source: string
}): void {
  try {
    db.prepare(`INSERT INTO memory_recall_events (memory_id, query, score, rank, caller_run_id, caller_role, source, created_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(
        params.memory_id,
        params.query,
        params.score,
        params.rank,
        params.caller_run_id ?? null,
        params.caller_role ?? null,
        params.source,
        Date.now(),
      )
  } catch {
    // memory_recall_events absent is a v2a-pre-PR-1 condition; ignore so the
    // recall path never fails because of telemetry.
  }
}

/**
 * Staged retrieval with the v2a envelope contract.
 *
 * Behavior:
 *   1. Delegate to the existing recallMemory() pipeline — preserves L1/L2
 *      routing, RRF fusion, embedder reranker, and entity-graph traversal.
 *   2. Apply min_score floor; results below floor are dropped.
 *   3. Insert a memory_recall_events row per surviving result so v2b PR 11's
 *      Dreaming pipeline has signal-ledger material from v2a's first run.
 *   4. Return { results, reason? } where:
 *        - reason='no_match' iff zero candidates were returned by recallMemory.
 *        - reason='below_floor' iff candidates existed but every one scored
 *          strictly below min_score.
 *        - reason omitted iff results is non-empty.
 */
export async function runStagedSearch<T extends CompactMemory | FullMemory = CompactMemory>(
  input: RunStagedSearchInput,
  db: Db = getDb(),
): Promise<StagedSearchResponse<T>> {
  const minScore = input.min_score ?? inferDefaultMinScore(input)
  const recallInput: RecallMemoryInput = {
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    query: input.query,
    scope: input.scope,
    kind: input.kind,
    file_path: input.file_path,
    session_id: input.session_id,
    task_id: input.task_id,
    limit: input.limit,
    offset: input.offset,
    mode: input.mode,
    query_scope: input.query_scope,
  }

  const candidates = (await recallMemory(recallInput, db)) as T[]

  if (candidates.length === 0) {
    return { results: [], reason: 'no_match' }
  }

  const survivors = candidates.filter(c => getScore(c) >= minScore)

  if (survivors.length === 0) {
    return { results: [], reason: 'below_floor' }
  }

  const source = input.recall_source ?? 'recall_memory'
  survivors.forEach((c, idx) => {
    logRecallEvent(db, {
      memory_id: (c as CompactMemory).memory_id ?? (c as FullMemory).memory_id,
      query: input.query,
      score: getScore(c),
      rank: idx + 1,
      caller_run_id: input.caller_run_id,
      caller_role: input.caller_role,
      source,
    })
  })

  return { results: survivors }
}
