/**
 * Hybrid scoring gated by FULCRUM_FEATURES=embeddings.
 *
 * Current weights:
 *   FTS_WEIGHT    = 0.3
 *   COSINE_WEIGHT = 0.7
 *
 * When useEmbeddings=false: returns FTS score only (weight 1.0), cosine ignored.
 * When useEmbeddings=true:  returns 0.3 * normalize(bm25) + 0.7 * cosine.
 *
 * normalize(bm25) = bm25 / max(bm25) within result set; 0 when max is 0.
 * Cosine similarity: dot(a,b) / (|a| * |b|); 0 when either vector is zero-length.
 */

export const FTS_WEIGHT = 0.3;
export const COSINE_WEIGHT = 0.7;

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  return dot / denom;
}

export function normalizeBm25(score: number, maxScore: number): number {
  if (maxScore === 0) return 0;
  return score / maxScore;
}

/**
 * Hybrid score with embeddings flag gate.
 *
 * @param ftsScore   - Normalized BM25/FTS score in [0, 1]
 * @param cosineScore - Cosine similarity in [0, 1]
 * @param options.useEmbeddings - When false, returns ftsScore only (FTS-only path)
 */
export function hybridScore(
  ftsScore: number,
  cosineScore: number,
  options: { useEmbeddings: boolean },
): number {
  if (!options.useEmbeddings) {
    // FTS-only path: no embeddings computed for this tenant
    return ftsScore;
  }
  return FTS_WEIGHT * ftsScore + COSINE_WEIGHT * cosineScore;
}
