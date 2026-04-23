import { describe, expect, it } from 'vitest'
import {
  RAG_LIFECYCLE_EVAL_CORPUS,
  RAG_LIFECYCLE_EVAL_CATEGORIES,
  RAG_LIFECYCLE_EVAL_FIXTURES,
  observeRagLifecycleFixtureCorpus,
} from './fixtures.js'
import { runRagLifecycleEvalSuite } from './runner.js'

describe('RAG lifecycle golden eval runner', () => {
  it('passes the checked-in deterministic fixtures across every result category', async () => {
    const result = await runRagLifecycleEvalSuite()

    expect(result.eval_run_id).toMatch(/^evalrun_/)
    expect(result.suite).toBe('rag-lifecycle')
    expect(result.status).toBe('passed')
    expect(result.failures).toEqual([])

    const fixtureCategories = new Set(RAG_LIFECYCLE_EVAL_FIXTURES.map(testCase => testCase.category))
    for (const category of RAG_LIFECYCLE_EVAL_CATEGORIES) {
      expect(fixtureCategories.has(category)).toBe(true)
      expect(result.results[category].passed).toBeGreaterThan(0)
      expect(result.results[category].failed).toBe(0)
    }
  })

  it('excludes superseded stale fixture claims and covers hybrid memory/code retrieval', async () => {
    const staleObservation = observeRagLifecycleFixtureCorpus(RAG_LIFECYCLE_EVAL_FIXTURES.find(testCase =>
      testCase.case_id === 'rag-memory-recall-001',
    )!)
    const hybridObservation = observeRagLifecycleFixtureCorpus(RAG_LIFECYCLE_EVAL_FIXTURES.find(testCase =>
      testCase.case_id === 'rag-hybrid-recall-001',
    )!)

    expect(staleObservation.retrieved_ids).toContain('mem_snapshot_contract')
    expect(staleObservation.retrieved_ids).not.toContain('mem_stale_snapshot_contract')
    expect(hybridObservation.retrieved_ids).toEqual(expect.arrayContaining([
      'mem_rebuild_report',
      'chunk_rebuild_candidate_promote',
    ]))
  })

  it('checks operational parity before retrieval assertions', async () => {
    const observed: string[] = []

    await runRagLifecycleEvalSuite({
      observer: async (testCase) => {
        observed.push(testCase.category)
        return observeRagLifecycleFixtureCorpus(testCase)
      },
    })

    expect(observed[0]).toBe('operational_parity')
  })

  it('groups broken retrieval, ranking, provenance, graph, and parity checks by category', async () => {
    const result = await runRagLifecycleEvalSuite({
      observer: async (testCase) => {
        const observation = observeRagLifecycleFixtureCorpus(testCase)
        if (testCase.case_id === 'rag-memory-recall-001') {
          return { ...observation, retrieved_ids: ['mem_wrong'] }
        }
        if (testCase.case_id === 'rag-code-search-001') {
          return { ...observation, retrieved_ids: ['chunk_wrong'] }
        }
        if (testCase.case_id === 'rag-ranking-001') {
          return { ...observation, retrieved_ids: ['mem_ranking_3', 'mem_ranking_2', 'mem_ranking_1'] }
        }
        if (testCase.case_id === 'rag-answer-001') {
          return { ...observation, answer: 'unrelated answer' }
        }
        if (testCase.case_id === 'rag-provenance-001') {
          return { ...observation, provenance_class: 'legacy-unbacked', source_ids: [] }
        }
        if (testCase.case_id === 'rag-graph-001') {
          return { ...observation, graph_expanded_ids: [] }
        }
        if (testCase.case_id === 'rag-parity-001') {
          return { ...observation, parity: { l0_l1: 'pass', code_chunks: 'fail', vectors: 'pass' } }
        }
        return observation
      },
    })

    expect(result.status).toBe('failed')
    expect(result.results.retrieval_relevance.failed).toBe(2)
    expect(result.results.ranking.failed).toBe(1)
    expect(result.results.answer_correctness.failed).toBe(1)
    expect(result.results.grounding_provenance.failed).toBe(1)
    expect(result.results.graph_expansion.failed).toBe(1)
    expect(result.results.operational_parity.failed).toBe(1)

    expect(result.failures.map(failure => failure.case_id)).toEqual([
      'rag-parity-001',
      'rag-memory-recall-001',
      'rag-code-search-001',
      'rag-ranking-001',
      'rag-answer-001',
      'rag-provenance-001',
      'rag-graph-001',
    ])
  })

  it('derives default observations from the checked-in fixture corpus', async () => {
    const result = await runRagLifecycleEvalSuite({
      corpus: {
        ...RAG_LIFECYCLE_EVAL_CORPUS,
        memories: RAG_LIFECYCLE_EVAL_CORPUS.memories.filter(memory =>
          memory.memory_id !== 'mem_snapshot_contract',
        ),
      },
    })

    expect(result.status).toBe('failed')
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        case_id: 'rag-memory-recall-001',
        category: 'retrieval_relevance',
      }),
    ]))
  })
})
