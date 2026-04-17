import { describe, it, expect } from 'vitest'
import { runFulcrumEval, computeNdcg, computeMrr } from '../harness.js'
import type { EvalCorpusEntry, EvalRetriever, FulcrumEvalResult } from '../harness.js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── Metric unit tests ────────────────────────────────────────────────────────

describe('computeMrr', () => {
  it('returns 1.0 when expected hit is rank 1', () => {
    expect(computeMrr([['a', 'b', 'c']], [['a']])).toBeCloseTo(1.0)
  })

  it('returns 0.5 when expected hit is rank 2', () => {
    expect(computeMrr([['x', 'a', 'b']], [['a']])).toBeCloseTo(0.5)
  })

  it('returns 0.0 when no hits in retrieved list', () => {
    expect(computeMrr([['x', 'y', 'z']], [['a', 'b']])).toBeCloseTo(0.0)
  })

  it('averages over multiple queries', () => {
    const retrieved = [['a'], ['x', 'b']]
    const expected = [['a'], ['b']]
    expect(computeMrr(retrieved, expected)).toBeCloseTo(0.75) // (1 + 0.5) / 2
  })
})

describe('computeNdcg', () => {
  it('returns 1.0 for perfect ranking', () => {
    // all expected hits at top-k positions
    expect(computeNdcg([['a', 'b', 'c']], [['a', 'b']], 10)).toBeCloseTo(1.0)
  })

  it('returns 0.0 when no hits', () => {
    expect(computeNdcg([['x', 'y', 'z']], [['a', 'b']], 10)).toBeCloseTo(0.0)
  })

  it('degrades when hits are pushed down', () => {
    const perfect = computeNdcg([['a', 'b']], [['a', 'b']], 10)
    const degraded = computeNdcg([['x', 'x', 'x', 'x', 'a', 'b']], [['a', 'b']], 10)
    expect(degraded).toBeLessThan(perfect)
  })
})

// ── Harness integration tests ────────────────────────────────────────────────

describe('runFulcrumEval', () => {
  const perfectRetriever: EvalRetriever = async (query, _scope, expectedIds) => {
    // always returns expected ids first
    return expectedIds
  }

  const zeroRetriever: EvalRetriever = async () => []

  const corpus: EvalCorpusEntry[] = [
    { query: 'auth middleware decision', expected_ids: ['mem_001', 'mem_002'], scope: 'project', kind: 'decision' },
    { query: 'schema migration safety', expected_ids: ['mem_003'], scope: 'project', kind: 'file_patch' },
    { query: 'task synthesis outcome', expected_ids: ['mem_004', 'mem_005'], scope: 'project', kind: 'task_outcome' },
  ]

  it('returns shape-stable FulcrumEvalResult', async () => {
    const result: FulcrumEvalResult = await runFulcrumEval(corpus, perfectRetriever)
    expect(result).toHaveProperty('r_at_5')
    expect(result).toHaveProperty('r_at_10')
    expect(result).toHaveProperty('mrr')
    expect(result).toHaveProperty('latency_p95')
    expect(result).toHaveProperty('ndcg_at_10')
    expect(result).toHaveProperty('total_queries')
    expect(result).toHaveProperty('per_kind')
  })

  it('perfect retriever → r_at_5 = 1.0 and mrr = 1.0', async () => {
    const result = await runFulcrumEval(corpus, perfectRetriever)
    expect(result.r_at_5).toBeCloseTo(1.0)
    expect(result.mrr).toBeCloseTo(1.0)
  })

  it('zero retriever → r_at_5 = 0 and mrr = 0', async () => {
    const result = await runFulcrumEval(corpus, zeroRetriever)
    expect(result.r_at_5).toBe(0)
    expect(result.mrr).toBe(0)
  })

  it('per_kind slices are present for each kind in corpus', async () => {
    const result = await runFulcrumEval(corpus, perfectRetriever)
    expect(result.per_kind).toHaveProperty('decision')
    expect(result.per_kind).toHaveProperty('file_patch')
    expect(result.per_kind).toHaveProperty('task_outcome')
  })

  it('latency_p95 is a non-negative number', async () => {
    const result = await runFulcrumEval(corpus, perfectRetriever)
    expect(typeof result.latency_p95).toBe('number')
    expect(result.latency_p95).toBeGreaterThanOrEqual(0)
  })

  it('total_queries equals corpus length', async () => {
    const result = await runFulcrumEval(corpus, perfectRetriever)
    expect(result.total_queries).toBe(3)
  })

  it('loads corpus from path and runs eval', async () => {
    const corpusPath = join(
      new URL('.', import.meta.url).pathname,
      '../corpus/v1/seed.json'
    )
    // seed.json must exist and be non-empty
    const raw = readFileSync(corpusPath, 'utf8')
    const loaded: EvalCorpusEntry[] = JSON.parse(raw)
    expect(loaded.length).toBeGreaterThanOrEqual(5)
    // all entries have required fields
    for (const entry of loaded) {
      expect(entry).toHaveProperty('query')
      expect(entry).toHaveProperty('expected_ids')
      expect(Array.isArray(entry.expected_ids)).toBe(true)
      expect(entry).toHaveProperty('scope')
    }
  })
})
