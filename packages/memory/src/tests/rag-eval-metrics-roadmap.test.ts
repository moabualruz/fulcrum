import { describe, expect, it } from 'vitest'
import { computeRoadmapEvalMetrics } from '../eval/index.js'

describe('roadmap RAG eval metrics', () => {
  it('computes recall@K, MRR, nDCG, context precision/recall, groundedness, provenance, citation accuracy, and latency', () => {
    const metrics = computeRoadmapEvalMetrics([
      {
        expected_sources: ['a', 'b'],
        retrieved_sources: ['x', 'a', 'b'],
        context_sources: ['a', 'x'],
        cited_sources: ['a'],
        grounded: true,
        latency_ms: 100,
      },
      {
        expected_sources: ['c'],
        retrieved_sources: ['c', 'z'],
        context_sources: ['c'],
        cited_sources: ['c'],
        grounded: false,
        latency_ms: 300,
      },
    ], { k: 5 })

    expect(metrics.recall_at_5).toBeCloseTo(1)
    expect(metrics.mrr).toBeCloseTo(0.75)
    expect(metrics.ndcg).toBeGreaterThan(0.8)
    expect(metrics.context_precision).toBeCloseTo(2 / 3)
    expect(metrics.context_recall).toBeCloseTo(2 / 3)
    expect(metrics.groundedness).toBeCloseTo(0.5)
    expect(metrics.provenance_coverage).toBeCloseTo(1)
    expect(metrics.citation_accuracy).toBeCloseTo(1)
    expect(metrics.latency_p95_ms).toBe(300)
  })

  it('returns zero quality metrics and zero latency for empty eval sets', () => {
    expect(computeRoadmapEvalMetrics([], { k: 5 })).toMatchObject({
      recall_at_5: 0,
      mrr: 0,
      ndcg: 0,
      context_precision: 0,
      context_recall: 0,
      groundedness: 0,
      provenance_coverage: 0,
      citation_accuracy: 0,
      latency_p95_ms: 0,
    })
  })
})
