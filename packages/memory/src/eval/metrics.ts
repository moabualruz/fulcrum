// packages/memory/src/eval/metrics.ts
// Retrieval quality metrics for the memory eval harness.

/**
 * recall@k — fraction of relevant IDs appearing in the top-k results.
 * @param relevant  Set of relevant memory IDs for this query
 * @param retrieved Ordered list of retrieved memory IDs (top-k)
 * @param k         Cut-off rank (default = retrieved.length)
 */
export function recallAtK(
  relevant: Set<string>,
  retrieved: string[],
  k: number = retrieved.length
): number {
  if (relevant.size === 0) return 1.0  // vacuously true
  const topK = retrieved.slice(0, k)
  const hits = topK.filter(id => relevant.has(id)).length
  return hits / relevant.size
}

/**
 * precision@k — fraction of top-k results that are relevant.
 */
export function precisionAtK(
  relevant: Set<string>,
  retrieved: string[],
  k: number = retrieved.length
): number {
  if (k === 0) return 0
  const topK = retrieved.slice(0, k)
  const hits = topK.filter(id => relevant.has(id)).length
  return hits / k
}

/**
 * MRR — Mean Reciprocal Rank across a list of (relevant, retrieved) pairs.
 */
export function mrr(cases: Array<{ relevant: Set<string>; retrieved: string[] }>): number {
  if (cases.length === 0) return 0
  let sum = 0
  for (const { relevant, retrieved } of cases) {
    const firstHit = retrieved.findIndex(id => relevant.has(id))
    if (firstHit >= 0) sum += 1 / (firstHit + 1)
  }
  return sum / cases.length
}

export interface EvalResult {
  queryId: string
  query: string
  recallAt5: number
  precisionAt5: number
  reciprocalRank: number
}

export interface AggregateResult {
  meanRecallAt5: number
  meanPrecisionAt5: number
  mrrScore: number
  passCount: number
  totalCount: number
  passRate: number
}

/**
 * ndcg@k — Normalized Discounted Cumulative Gain at k.
 * DCG@K = sum of (rel_i / log2(i+2)) for i in 0..K-1 (binary relevance: 1 if relevant, 0 otherwise)
 * NDCG@K = DCG@K / IDCG@K where IDCG is the perfect ranking
 */
export function ndcg(
  retrieved: string[],
  relevant: Set<string>,
  k = 5
): number {
  const topK = retrieved.slice(0, k)
  const dcg = topK.reduce((sum, id, i) => {
    const rel = relevant.has(id) ? 1 : 0
    return sum + rel / Math.log2(i + 2)
  }, 0)
  // IDCG: perfect case where all relevant docs are at top
  const perfectK = Math.min(relevant.size, k)
  const idcg = Array.from({ length: perfectK }, (_, i) => 1 / Math.log2(i + 2))
    .reduce((a, b) => a + b, 0)
  return idcg === 0 ? 0 : dcg / idcg
}

export function aggregate(results: EvalResult[]): AggregateResult {
  if (results.length === 0) {
    return { meanRecallAt5: 0, meanPrecisionAt5: 0, mrrScore: 0, passCount: 0, totalCount: 0, passRate: 0 }
  }
  const meanRecallAt5 = results.reduce((s, r) => s + r.recallAt5, 0) / results.length
  const meanPrecisionAt5 = results.reduce((s, r) => s + r.precisionAt5, 0) / results.length
  const mrrScore = results.reduce((s, r) => s + r.reciprocalRank, 0) / results.length
  const passCount = results.filter(r => r.recallAt5 >= 0.5).length
  return {
    meanRecallAt5,
    meanPrecisionAt5,
    mrrScore,
    passCount,
    totalCount: results.length,
    passRate: passCount / results.length,
  }
}
