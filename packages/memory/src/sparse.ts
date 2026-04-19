// packages/memory/src/sparse.ts
// Sparse vector encoding for the recall pipeline (GAP-RAG-7).
//
// SPLADE (Sparse Lexical and Expansion) produces learned sparse vectors
// that map vocabulary terms to scalar weights, enabling high-precision
// retrieval via dot-product similarity. True SPLADE requires a fine-tuned
// transformer model (e.g. naver/splade-v3), which is a large external
// dependency.
//
// This module implements a BM25-style approximation that provides the same
// interface without an external model:
//   1. Tokenise text into terms (lowercase words + camelCase splits)
//   2. Weight each term by log(1 + TF) — log-term-frequency
//   3. L2-normalise the vector so dot products are bounded in [0, 1]
//   4. Keep only the top-K terms to keep storage compact
//
// The sparse dot-product is then used as a 3rd RRF signal alongside FTS5 BM25
// and dense vector similarity. The signal is complementary:
//   - FTS5 BM25:  ranked search over the FTS5 virtual table
//   - Dense vec:  semantic similarity via floating-point embeddings
//   - Sparse vec: explicit term-overlap retrieval independent of FTS5 ranking
//
// The sparse vector is stored as a JSON blob in memories.sparse_vector
// (added by migration m048) and computed at write time for code-kind memories.
// Non-code memories still benefit — the sparse path is always active.

/** Sparse vector: term → weight (non-negative, L2-normalised) */
export type SparseVector = Record<string, number>

// Characters that act as word boundaries for tokenisation.
const TOKEN_RE = /\b[a-zA-Z][a-zA-Z0-9]*\b/g

// Common English stop words — excluded from sparse vectors to reduce noise.
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'it', 'its', 'be', 'are',
  'was', 'were', 'been', 'has', 'have', 'had', 'do', 'does', 'did',
  'will', 'would', 'can', 'could', 'should', 'may', 'might', 'not',
  'no', 'so', 'if', 'then', 'this', 'that', 'these', 'those',
])

/**
 * Split a token on camelCase / PascalCase boundaries.
 * "getUserById" → ["get", "user", "by", "id"]
 * "XMLParser"   → ["xml", "parser"]
 */
function splitCamel(token: string): string[] {
  return token
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(' ')
    .map(t => t.toLowerCase())
    .filter(t => t.length > 1)
}

/**
 * Tokenise text into a flat list of normalised terms.
 * Applies camelCase splitting and stop-word removal.
 */
export function tokenise(text: string): string[] {
  const raw = text.match(TOKEN_RE) ?? []
  const terms: string[] = []
  for (const tok of raw) {
    for (const part of splitCamel(tok)) {
      if (!STOP_WORDS.has(part) && part.length > 1) {
        terms.push(part)
      }
    }
  }
  return terms
}

/**
 * Compute a sparse vector from text.
 *
 * Steps:
 *   1. Tokenise + camelCase split
 *   2. Count term frequencies
 *   3. Apply log(1 + TF) weighting
 *   4. L2-normalise
 *   5. Keep top maxTerms by weight
 *
 * @param text      Input text (the memory's body)
 * @param maxTerms  Max vocabulary size kept per vector (default 128)
 */
export function computeSparseVector(text: string, maxTerms = 128): SparseVector {
  const terms = tokenise(text)
  if (terms.length === 0) return {}

  // Term frequencies
  const counts: Record<string, number> = {}
  for (const t of terms) {
    counts[t] = (counts[t] ?? 0) + 1
  }

  // Log-TF weighting
  const weighted: Record<string, number> = {}
  for (const [term, count] of Object.entries(counts)) {
    weighted[term] = Math.log(1 + count)
  }

  // Keep top maxTerms
  const topEntries = Object.entries(weighted)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTerms)

  // L2 normalise so dot products are in [0, 1]
  const norm = Math.sqrt(topEntries.reduce((sum, [, w]) => sum + w * w, 0))
  const result: SparseVector = {}
  if (norm > 0) {
    for (const [term, w] of topEntries) {
      result[term] = w / norm
    }
  }
  return result
}

/**
 * Dot product between two sparse vectors.
 * Only iterates over the shorter vector — O(min(|q|, |d|)).
 */
export function sparseDotProduct(queryVec: SparseVector, docVec: SparseVector): number {
  // Iterate over shorter side for efficiency
  const [small, large] = Object.keys(queryVec).length <= Object.keys(docVec).length
    ? [queryVec, docVec]
    : [docVec, queryVec]
  let score = 0
  for (const [term, weight] of Object.entries(small)) {
    const dw = large[term]
    if (dw !== undefined) score += weight * dw
  }
  return score
}

/**
 * Rank a list of memory rows by sparse dot-product similarity to a query.
 * Returns rows sorted descending by similarity, with zero-score rows included
 * (they contribute a penalty RRF rank).
 *
 * @param query   Raw query string
 * @param rows    Memory rows that must have a `sparse_vector` TEXT column
 * @returns       Array of { rowid, sparseRank } sorted by similarity (1-indexed rank)
 */
export function sparseRank(
  query: string,
  rows: Array<{ memory_id: string; sparse_vector: string | null }>,
): Map<string, number> {
  const queryVec = computeSparseVector(query)
  if (Object.keys(queryVec).length === 0) return new Map()

  const scored = rows
    .map(r => {
      let docVec: SparseVector = {}
      if (r.sparse_vector) {
        try { docVec = JSON.parse(r.sparse_vector) as SparseVector } catch { /* ignore */ }
      }
      return { memory_id: r.memory_id, score: sparseDotProduct(queryVec, docVec) }
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)

  const result = new Map<string, number>()
  scored.forEach((s, i) => result.set(s.memory_id, i + 1))
  return result
}
