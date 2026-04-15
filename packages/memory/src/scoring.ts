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
 * Freshness decays linearly from 1 (now) to 0 (90 days old). Never negative.
 */
export function computeFreshness(updatedAt: string): number {
  const daysSinceUpdate = (Date.now() - Date.parse(updatedAt)) / 86_400_000
  return Math.max(0, 1 - daysSinceUpdate / 90)
}

/**
 * Reciprocal Rank Fusion — k=60.
 * Null rank means signal absent: uses penalty position 1000.
 */
export function rrfScore(ftsRank: number | null, vectorRank: number | null): number {
  const k = 60
  const fts = ftsRank !== null ? 1 / (k + ftsRank) : 1 / (k + 1000)
  const vec = vectorRank !== null ? 1 / (k + vectorRank) : 1 / (k + 1000)
  return fts + vec
}

/**
 * Combined recall score: RRF score multiplied by the stored freshness field.
 * freshness=1.0 (brand new) leaves the score unchanged; freshness=0 suppresses it entirely.
 */
export function recallScore(
  ftsRank: number | null,
  vectorRank: number | null,
  freshness: number
): number {
  return rrfScore(ftsRank, vectorRank) * freshness
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
