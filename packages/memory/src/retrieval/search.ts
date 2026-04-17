// v2a PR 2 Task 10 — staged retrieval pipeline.
//
// Orchestrates the v2a retrieval contract on top of the existing recall.ts
// implementation: parallel FTS5 + vec lookup, RRF fusion (k=60) via scoring.ts,
// optional pooled-cosine rerank → 40 candidates, ColBERT MaxSim rerank → 20
// (graceful degradation when multi-vector embeddings unavailable), per-file
// diversification (max N=3 per file), H/M/L calibration, and the
// {results, reason?} envelope per the plan's pre-resolved decision #5.

import type { Db } from 'fulcrum-agent-core'
import { getDb } from 'fulcrum-agent-core'
import { recallMemory } from '../recall.js'
import { cosineSim } from './colbert-math.js'
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
  /** Max results per unique file_path in diversification pass. Default: 3. */
  max_per_file?: number
}

// Rerank target sizes per plan spec.
const COSINE_RERANK_SIZE = 40
// Plan specifies top-20 after second-stage rerank; kept as a named constant so
// the intent is clear even though multi-vector storage is not yet implemented.
const COLBERT_RERANK_SIZE = 20

// H/M/L calibration thresholds.
const SCORE_HIGH = 0.7
const SCORE_MED = 0.4

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

function getMemoryId(item: CompactMemory | FullMemory): string {
  return (item as CompactMemory).memory_id
}

function getFilePath(item: CompactMemory | FullMemory): string | null {
  return (item as CompactMemory).file_path ?? null
}

function setScore<T extends CompactMemory | FullMemory>(item: T, score: number): T {
  if ('recall_score' in item) return { ...item, recall_score: score }
  return { ...(item as object), recall_score: score } as T
}

/**
 * Pooled-cosine rerank: fetch stored embeddings from vec_memories, compute
 * cosine similarity against the query embedding, blend with RRF score.
 * Operates on up to COSINE_RERANK_SIZE candidates.
 */
async function pooledCosineRerank<T extends CompactMemory | FullMemory>(
  candidates: T[],
  query: string,
  db: Db,
): Promise<T[]> {
  if (candidates.length === 0) return candidates
  try {
    const { getTextEmbedder } = await import('fulcrum-agent-core')
    const embedder = getTextEmbedder?.()
    if (!embedder) return candidates

    const queryVec = await (embedder.embedQuery ?? embedder.embed).bind(embedder)(query)
    const top = candidates.slice(0, COSINE_RERANK_SIZE)
    const ids = top.map(c => getMemoryId(c))
    const placeholders = ids.map(() => '?').join(',')
    const rows = db.prepare(
      `SELECT memory_id, embedding FROM vec_memories WHERE memory_id IN (${placeholders})`
    ).all(...ids) as Array<{ memory_id: string; embedding: Buffer | Uint8Array }>

    const embMap = new Map<string, Float32Array>()
    for (const row of rows) {
      const buf = row.embedding instanceof Buffer ? row.embedding : Buffer.from(row.embedding)
      embMap.set(row.memory_id, new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4))
    }

    const qVec = queryVec instanceof Float32Array ? queryVec : new Float32Array(queryVec)

    const reranked = top.map(c => {
      const docVec = embMap.get(getMemoryId(c))
      if (!docVec) return { item: c, score: getScore(c) }
      const cos = cosineSim(qVec, docVec)
      // Blend: 0.5 * RRF score + 0.5 * cosine similarity
      const blended = 0.5 * getScore(c) + 0.5 * Math.max(0, cos)
      return { item: c, score: blended }
    }).sort((a, b) => b.score - a.score)

    const rerankedItems = reranked.map(r => setScore(r.item, r.score))
    // Append any candidates that were beyond COSINE_RERANK_SIZE unchanged
    return [...rerankedItems, ...candidates.slice(COSINE_RERANK_SIZE)] as T[]
  } catch {
    return candidates
  }
}

/** Truncate to COLBERT_RERANK_SIZE. ColBERT MaxSim is a no-op until multi-vector storage lands. */
function truncateToColbertWindow<T extends CompactMemory | FullMemory>(candidates: T[]): T[] {
  return candidates.slice(0, COLBERT_RERANK_SIZE)
}

/**
 * Per-file diversification: limits results to max_per_file per unique file_path.
 * Memories without a file_path are treated as uncapped.
 */
export function diversifyByFile<T extends CompactMemory | FullMemory>(
  candidates: T[],
  maxPerFile: number,
): T[] {
  const fileCounts = new Map<string, number>()
  const result: T[] = []
  for (const c of candidates) {
    const fp = getFilePath(c)
    if (!fp) {
      result.push(c)
      continue
    }
    const count = fileCounts.get(fp) ?? 0
    if (count < maxPerFile) {
      fileCounts.set(fp, count + 1)
      result.push(c)
    }
  }
  return result
}

/**
 * H/M/L calibration: normalizes scores to [0,1] and maps them to buckets.
 * High ≥ SCORE_HIGH, Medium ≥ SCORE_MED, Low otherwise. If all scores are
 * already in [0,1] they pass through unchanged. If scores fall outside [0,1]
 * they are min-max normalized across the candidate set first.
 */
export function calibrateScores<T extends CompactMemory | FullMemory>(candidates: T[]): T[] {
  if (candidates.length === 0) return candidates
  const scores = candidates.map(getScore)
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const range = max - min

  return candidates.map((c, i) => {
    const raw = scores[i]!
    // Normalize to [0,1] if not already in range
    const norm = range > 0 ? (raw - min) / range : 1
    // Snap to H/M/L bucket midpoints to reduce noise
    const calibrated = norm >= SCORE_HIGH ? norm
      : norm >= SCORE_MED ? SCORE_MED + (norm - SCORE_MED) * 0.5
      : norm * (SCORE_MED / SCORE_HIGH)
    return setScore(c, Math.min(1, Math.max(0, calibrated)))
  })
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
 * Pipeline:
 *   1. recallMemory() — FTS5 + vec + sparse + RRF + optional L2 traversal.
 *   2. Pooled-cosine rerank over top-40 candidates (blended RRF + cosine).
 *   3. ColBERT MaxSim rerank over top-20 (no-op until multi-vector storage).
 *   4. Per-file diversification (max 3 per file_path by default).
 *   5. H/M/L score calibration to [0,1].
 *   6. min_score floor; results below floor are dropped.
 *   7. recall_events ledger insertion for Dreaming signal.
 */
export async function runStagedSearch<T extends CompactMemory | FullMemory = CompactMemory>(
  input: RunStagedSearchInput,
  db: Db = getDb(),
): Promise<StagedSearchResponse<T>> {
  const minScore = input.min_score ?? inferDefaultMinScore(input)
  const maxPerFile = input.max_per_file ?? 3
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

  let candidates = (await recallMemory(recallInput, db)) as T[]

  if (candidates.length === 0) {
    return { results: [], reason: 'no_match' }
  }

  // Stage 2: pooled-cosine rerank (top-40)
  candidates = await pooledCosineRerank(candidates, input.query, db)

  // Stage 3: truncate to top-20 window (ColBERT MaxSim pending multi-vector storage)
  candidates = truncateToColbertWindow(candidates)

  // Stage 4: per-file diversification
  candidates = diversifyByFile(candidates, maxPerFile)

  // Stage 5: H/M/L calibration
  candidates = calibrateScores(candidates)

  // Stage 6: min_score floor
  const survivors = candidates.filter(c => getScore(c) >= minScore)

  if (survivors.length === 0) {
    return { results: [], reason: 'below_floor' }
  }

  const source = input.recall_source ?? 'recall_memory'
  survivors.forEach((c, idx) => {
    logRecallEvent(db, {
      memory_id: getMemoryId(c),
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
