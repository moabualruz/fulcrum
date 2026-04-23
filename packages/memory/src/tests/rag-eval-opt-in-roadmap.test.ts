import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { runRoadmapRagEvalSuite, type RoadmapRagEvalCase } from '../eval/index.js'

const cases: RoadmapRagEvalCase[] = [
  {
    suite: 'unified-context',
    query: 'normal query',
    required_domains: ['memory'],
    expected_sources: ['mem:normal'],
    thresholds: { recall_at_5: 1 },
  },
  {
    suite: 'unified-context',
    query: 'model heavy query',
    required_domains: ['memory'],
    expected_sources: ['mem:model'],
    thresholds: { recall_at_5: 1 },
    model_heavy: true,
  },
  {
    suite: 'unified-context',
    query: 'accelerator heavy query',
    required_domains: ['vectors'],
    expected_sources: ['vec:accelerator'],
    thresholds: { recall_at_5: 1 },
    accelerator_heavy: true,
  },
]

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  delete process.env['FULCRUM_RAG_EVAL_MODEL_HEAVY']
  delete process.env['FULCRUM_RAG_EVAL_ACCELERATOR_HEAVY']
  resetTestDb()
})

describe('roadmap RAG eval opt-in gating', () => {
  it('skips model-heavy and accelerator-heavy cases by default', async () => {
    const executed: string[] = []
    const result = await runRoadmapRagEvalSuite({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      suite: 'unified-context',
      cases,
      required_domains: ['memory', 'vectors'],
      retriever: async (testCase) => {
        executed.push(testCase.query)
        return {
          retrieved_sources: testCase.expected_sources,
          context_sources: testCase.expected_sources,
          cited_sources: testCase.expected_sources,
          grounded: true,
          latency_ms: 1,
        }
      },
    })

    expect(executed).toEqual(['normal query'])
    expect(result.status).toBe('passed')
    expect(result.results.filter(row => row.status === 'skipped')).toHaveLength(2)
    expect(result.results.map(row => row.failures[0]?.code).filter(Boolean)).toEqual([
      'model_heavy_eval_skipped',
      'accelerator_heavy_eval_skipped',
    ])
  })

  it('runs heavy cases only when explicitly requested', async () => {
    const executed: string[] = []
    const result = await runRoadmapRagEvalSuite({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      suite: 'unified-context',
      cases,
      required_domains: ['memory', 'vectors'],
      include_model_heavy: true,
      include_accelerator_heavy: true,
      retriever: async (testCase) => {
        executed.push(testCase.query)
        return {
          retrieved_sources: testCase.expected_sources,
          context_sources: testCase.expected_sources,
          cited_sources: testCase.expected_sources,
          grounded: true,
          latency_ms: 1,
        }
      },
    })

    expect(executed).toEqual(['normal query', 'model heavy query', 'accelerator heavy query'])
    expect(result.status).toBe('passed')
    expect(result.results.every(row => row.status === 'passed')).toBe(true)
  })
})
