/**
 * Hybrid scoring — gated by FULCRUM_FEATURES=embeddings.
 *
 * Formula: score = 0.6 * normalize(bm25) + 0.4 * cosine(queryEmbed, memoryEmbed)
 * Recency and importance boosts remain additive on top.
 *
 * normalize(bm25) = bm25 / max(bm25) within result set; 0 when max is 0.
 * Cosine similarity: dot(a,b) / (|a| * |b|); 0 when either vector is zero-length.
 */

const BM25_WEIGHT = 0.6;
const COSINE_WEIGHT = 0.4;

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  return dot / denom;
}

export function normalizeBm25(score: number, maxScore: number): number {
  if (maxScore === 0) return 0;
  return score / maxScore;
}

export function hybridScore(
  bm25: number,
  maxBm25: number,
  cosine: number,
): number {
  return BM25_WEIGHT * normalizeBm25(bm25, maxBm25) + COSINE_WEIGHT * cosine;
}
