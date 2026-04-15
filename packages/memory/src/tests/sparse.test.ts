// packages/memory/src/tests/sparse.test.ts
import { describe, it, expect } from 'vitest'
import { tokenise, computeSparseVector, sparseDotProduct, sparseRank } from '../sparse.js'

describe('tokenise', () => {
  it('splits plain words', () => {
    const tokens = tokenise('hello world foo bar')
    expect(tokens).toContain('hello')
    expect(tokens).toContain('world')
  })

  it('splits camelCase identifiers', () => {
    const tokens = tokenise('getUserById')
    expect(tokens).toContain('get')
    expect(tokens).toContain('user')
    // 'by' is a stop word — filtered out
    expect(tokens).not.toContain('by')
    expect(tokens).toContain('id')
  })

  it('splits PascalCase', () => {
    const tokens = tokenise('UserProfileService')
    expect(tokens).toContain('user')
    expect(tokens).toContain('profile')
    expect(tokens).toContain('service')
  })

  it('removes stop words', () => {
    const tokens = tokenise('the quick fox and a dog')
    expect(tokens).not.toContain('the')
    expect(tokens).not.toContain('and')
    expect(tokens).not.toContain('a')
    expect(tokens).toContain('quick')
    expect(tokens).toContain('fox')
  })

  it('returns empty array for empty string', () => {
    expect(tokenise('')).toEqual([])
  })
})

describe('computeSparseVector', () => {
  it('returns a non-empty vector for non-trivial text', () => {
    const vec = computeSparseVector('getUserById returns the user object from the database')
    expect(Object.keys(vec).length).toBeGreaterThan(0)
  })

  it('vector values are between 0 and 1 (L2 normalised)', () => {
    const vec = computeSparseVector('authentication token validation middleware pipeline')
    for (const w of Object.values(vec)) {
      expect(w).toBeGreaterThan(0)
      expect(w).toBeLessThanOrEqual(1)
    }
  })

  it('respects maxTerms limit', () => {
    const longText = Array.from({ length: 200 }, (_, i) => `term${i}`).join(' ')
    const vec = computeSparseVector(longText, 64)
    expect(Object.keys(vec).length).toBeLessThanOrEqual(64)
  })

  it('repeated terms have higher weight than single-occurrence terms', () => {
    const vec = computeSparseVector('auth auth auth token')
    expect(vec['auth']).toBeGreaterThan(vec['token']!)
  })

  it('returns empty object for empty string', () => {
    expect(computeSparseVector('')).toEqual({})
  })

  it('vector is L2-normalised (||v||₂ ≈ 1)', () => {
    const vec = computeSparseVector('authentication middleware token validation')
    const norm = Math.sqrt(Object.values(vec).reduce((s, w) => s + w * w, 0))
    expect(norm).toBeCloseTo(1.0, 5)
  })
})

describe('sparseDotProduct', () => {
  it('returns 0 for disjoint vectors', () => {
    const a = { alpha: 0.5, beta: 0.5 }
    const b = { gamma: 0.7, delta: 0.3 }
    expect(sparseDotProduct(a, b)).toBe(0)
  })

  it('returns positive score for overlapping vectors', () => {
    const a = { auth: 0.6, token: 0.4 }
    const b = { auth: 0.7, user: 0.3 }
    const score = sparseDotProduct(a, b)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeCloseTo(0.6 * 0.7, 5)
  })

  it('is commutative', () => {
    const a = { foo: 0.5, bar: 0.3 }
    const b = { foo: 0.4, baz: 0.6 }
    expect(sparseDotProduct(a, b)).toBeCloseTo(sparseDotProduct(b, a), 10)
  })

  it('handles empty vectors', () => {
    expect(sparseDotProduct({}, { auth: 0.5 })).toBe(0)
    expect(sparseDotProduct({ auth: 0.5 }, {})).toBe(0)
  })
})

describe('sparseRank', () => {
  it('returns empty map for empty rows', () => {
    const result = sparseRank('auth token', [])
    expect(result.size).toBe(0)
  })

  it('ranks rows by sparse similarity', () => {
    const query = 'authentication token middleware'
    // doc_a has strong overlap with query; doc_b has no overlap
    const docAVec = computeSparseVector('authentication token middleware pipeline security')
    const docBVec = computeSparseVector('database schema migration table column index')
    const rows = [
      { rowid: 1, sparse_vector: JSON.stringify(docAVec) },
      { rowid: 2, sparse_vector: JSON.stringify(docBVec) },
    ]
    const ranks = sparseRank(query, rows)
    // doc_a should rank above doc_b (rank 1 vs rank 2)
    const rankA = ranks.get(1)
    const rankB = ranks.get(2)
    expect(rankA).toBeDefined()
    expect(rankB ?? Infinity).toBeGreaterThan(rankA!)
  })

  it('excludes rows with no overlap (score=0) from results', () => {
    const query = 'authentication middleware'
    const rows = [
      { rowid: 1, sparse_vector: JSON.stringify({ completely: 0.5, different: 0.5 }) },
    ]
    const ranks = sparseRank(query, rows)
    // No overlap → score=0 → excluded from map
    expect(ranks.size).toBe(0)
  })

  it('handles null sparse_vector gracefully', () => {
    const rows = [
      { rowid: 1, sparse_vector: null },
      { rowid: 2, sparse_vector: JSON.stringify(computeSparseVector('authentication token')) },
    ]
    const ranks = sparseRank('auth token', rows)
    // rowid 1 with null vector should not appear
    expect(ranks.has(1)).toBe(false)
  })
})
