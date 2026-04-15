// packages/memory/src/scoring.ts

/**
 * Dynamic importance score — never stored in DB, computed at recall time.
 * Weights: access_count×0.3, entity_links×0.4, confidence×0.3
 */
export function computeImportance(m: {
  access_count: number
  confidence: number
  entity_link_count: number
}): number {
  return (Math.min(m.access_count / 100, 1) * 0.3) +
         (Math.min(m.entity_link_count / 10, 1) * 0.4) +
         (m.confidence * 0.3)
}

/**
 * Freshness decays exponentially from 1.0 (now) toward 0.1 (very old).
 * Formula: 0.1 + 0.9 * exp(-ageDays / 130)
 *   - At 0 days:   1.0
 *   - At ~90 days: ~0.55
 *   - At ~200 days: ~0.25
 *   - Asymptotes toward 0.1 (never reaches 0)
 */
export function computeFreshness(updatedAt: string): number {
  const ageMs = Date.now() - new Date(updatedAt).getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  return 0.1 + 0.9 * Math.exp(-ageDays / 130)
}

/**
 * Two-signal Reciprocal Rank Fusion (FTS5 + dense vector) — k=60.
 * Null rank means signal absent: uses penalty position 1000.
 *
 * For the full 3-signal version (FTS5 + dense + sparse), use rrfScoreWithSparse.
 */
export function rrfScore(
  ftsRank: number | null,
  vectorRank: number | null,
): number {
  const k = 60
  const fts = ftsRank !== null ? 1 / (k + ftsRank) : 1 / (k + 1000)
  const vec = vectorRank !== null ? 1 / (k + vectorRank) : 1 / (k + 1000)
  return fts + vec
}

/**
 * Three-signal RRF: FTS5 + dense vector + sparse vector.
 *
 * The sparse signal is used ONLY as a rescue path — it contributes a score
 * for documents that appeared in the sparse retrieval BUT NOT in either
 * FTS5 or dense vector results. Documents already ranked by FTS5/dense
 * are NOT re-scored by sparse to avoid noise from TF-only weighting.
 *
 * This approach adds recall (surfaces documents missed by BM25/vec) without
 * displacing existing high-quality results. Full sparse re-scoring would require
 * IDF calibration (corpus-level document frequencies) which sqlite-vec/FTS5
 * provides via fts5vocab — that is left as a future enhancement.
 */
export function rrfScoreWithSparse(
  ftsRank: number | null,
  vectorRank: number | null,
  sparseRank: number | null,
): number {
  const k = 60
  const fts = ftsRank !== null ? 1 / (k + ftsRank) : 1 / (k + 1000)
  const vec = vectorRank !== null ? 1 / (k + vectorRank) : 1 / (k + 1000)
  // Sparse contributes only for rescue candidates (no FTS5 or vec rank).
  // For candidates that already have FTS5/vec signals, sparse adds 0.
  const isSparseOnly = ftsRank === null && vectorRank === null
  const spr = (isSparseOnly && sparseRank !== null) ? 1 / (k + sparseRank) : 0
  return fts + vec + spr
}

/**
 * Combined recall score: RRF score multiplied by the stored freshness field.
 * freshness=1.0 (brand new) leaves the score unchanged; freshness=0 suppresses it entirely.
 * sparseRank, when provided, routes through rrfScoreWithSparse for the 3-signal score.
 */
export function recallScore(
  ftsRank: number | null,
  vectorRank: number | null,
  freshness: number,
  sparseRank: number | null = null,
): number {
  const base = sparseRank !== null
    ? rrfScoreWithSparse(ftsRank, vectorRank, sparseRank)
    : rrfScore(ftsRank, vectorRank)
  return base * freshness
}

/**
 * Reciprocal Rank Fusion list combiner.
 *
 * Given two ranked lists (listA, listB), fuses them into a single list
 * ordered by descending RRF score: score(d) = Σ 1/(k + rank(d)), k=60.
 * Items present in only one list receive a penalty rank of listLength+1
 * for the absent signal.
 */
export function rrfFuse<T extends { memory_id?: string; id?: string }>(
  listA: T[],
  listB: T[],
  k = 60
): T[] {
  const getId = (item: T): string =>
    item.memory_id ?? (item as unknown as { id: string }).id

  const rankA = new Map(listA.map((item, i) => [getId(item), i + 1]))
  const rankB = new Map(listB.map((item, i) => [getId(item), i + 1]))

  // Union of all IDs
  const allIds = new Set([...listA.map(getId), ...listB.map(getId)])

  // Score each
  const scored = Array.from(allIds).map(id => {
    const rA = rankA.get(id) ?? (listA.length + 1)
    const rB = rankB.get(id) ?? (listB.length + 1)
    const score = 1 / (k + rA) + 1 / (k + rB)
    const item = listA.find(x => getId(x) === id) ?? listB.find(x => getId(x) === id)!
    return { item, score }
  })

  // Sort by RRF score descending
  scored.sort((a, b) => b.score - a.score)
  return scored.map(s => s.item)
}
