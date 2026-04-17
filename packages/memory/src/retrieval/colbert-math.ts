// License: Apache-2.0
//
// v2a PR 1 Task 7 — ColBERT MaxSim and cosine similarity primitives. PR 2
// uses this in the second-stage rerank.
//
// Differences from upstream:
//   * No simsimd dependency — uses a hot-loop dot-product implementation
//     (single function call per pair; modern V8 SIMDifies the loop). Replace
//     with simsimd later if profiling shows benefit.
//   * Skiplist removal: upstream loaded a token-id skiplist from disk.
//     Skiplist is now a parameter — defaults to empty.
//   * No PATHS / MODEL_IDS imports — caller passes a Set<number> when needed.

function dotProduct(a: Float32Array, b: Float32Array, dim: number): number {
  let sum = 0
  for (let i = 0; i < dim; i++) {
    sum += a[i]! * b[i]!
  }
  return sum
}

export function maxSim(
  queryEmbeddings: number[][] | Float32Array[],
  docEmbeddings: number[][] | Float32Array[],
  docTokenIds?: number[],
  skipIds: Set<number> = new Set(),
): number {
  if (queryEmbeddings.length === 0 || docEmbeddings.length === 0) return 0

  const qVecs = queryEmbeddings.map(v => v instanceof Float32Array ? v : new Float32Array(v))
  const dVecs = docEmbeddings.map(v => v instanceof Float32Array ? v : new Float32Array(v))
  const dTokenIds = docTokenIds && docTokenIds.length === dVecs.length ? docTokenIds : null

  let totalScore = 0
  for (const qVec of qVecs) {
    let maxDotProduct = -Infinity
    for (let idx = 0; idx < dVecs.length; idx++) {
      const tokenId = dTokenIds ? dTokenIds[idx] : null
      if (tokenId !== null && skipIds.has(Number(tokenId))) continue
      const dVec = dVecs[idx]!
      const dim = Math.min(qVec.length, dVec.length)
      const dot = dotProduct(qVec.subarray(0, dim), dVec.subarray(0, dim), dim)
      if (dot > maxDotProduct) maxDotProduct = dot
    }
    if (maxDotProduct === -Infinity) maxDotProduct = 0
    totalScore += maxDotProduct
  }

  return totalScore
}

export function cosineSim(a: number[] | Float32Array, b: number[] | Float32Array): number {
  const aVec = a instanceof Float32Array ? a : new Float32Array(a)
  const bVec = b instanceof Float32Array ? b : new Float32Array(b)
  const dim = Math.min(aVec.length, bVec.length)
  return dotProduct(aVec.subarray(0, dim), bVec.subarray(0, dim), dim)
}
