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
