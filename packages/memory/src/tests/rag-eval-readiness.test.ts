import { describe, expect, it } from 'vitest'
import { assessRagEvalReadiness, type RoadmapRagEvalCase } from '../eval/index.js'

describe('RAG eval readiness', () => {
  it('degrades required domains that have zero expected live cases', () => {
    const cases: RoadmapRagEvalCase[] = [{
      suite: 'live-rag',
      query: 'how are vectors repaired',
      required_domains: ['vectors'],
      expected_sources: ['vector:mem_1'],
      thresholds: { recall_at_5: 0.8 },
    }]

    const readiness = assessRagEvalReadiness({
      suite: 'live-rag',
      required_domains: ['vectors', 'graph', 'code'],
      cases,
    })

    expect(readiness.status).toBe('degraded')
    expect(readiness.missing_expected_case_domains).toEqual(['graph', 'code'])
    expect(readiness.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'eval_expected_cases_missing', details: { domain: 'graph' } }),
      expect.objectContaining({ code: 'eval_expected_cases_missing', details: { domain: 'code' } }),
    ]))
  })

  it('treats disabled-only expected cases as missing for required readiness', () => {
    const readiness = assessRagEvalReadiness({
      suite: 'live-rag',
      required_domains: ['graph'],
      cases: [{
        suite: 'live-rag',
        query: 'graph relationship query',
        required_domains: ['graph'],
        expected_sources: ['graph:edge_1'],
        status: 'disabled',
        thresholds: { recall_at_5: 1 },
      }],
    })

    expect(readiness.status).toBe('degraded')
    expect(readiness.missing_expected_case_domains).toEqual(['graph'])
  })
})
