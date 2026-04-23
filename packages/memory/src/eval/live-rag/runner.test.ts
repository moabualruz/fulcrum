import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from '../../tests/helpers.js'
import { runLiveRagEvalSuite } from './runner.js'
import type { RoadmapRagEvalCase } from '../index.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('live-rag eval runner', () => {
  it('runs live fixture cases, persists run/case/result rows, and returns roadmap output shape', async () => {
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, title, summary, entities, provenance
      ) VALUES (
        'mem_live_vector_coverage', 'ws_1', 'proj_1', 'fact', 'project',
        'live vector coverage source', 'hash-live-vector',
        3, 'live vector coverage', 'live vector coverage', '[]', '{}'
      )
    `).run()
    getDb().prepare(`
      INSERT INTO vector_metadata (
        vector_metadata_id, workspace_id, source_domain, source_id,
        content_hash, provider, model, requested_device, actual_device,
        dimensions, vector_table, status
      ) VALUES (
        'vecmeta_live_vector_coverage', 'ws_1', 'memory', 'mem_live_vector_coverage',
        'hash-live-vector', 'stub', 'stub', 'cpu', 'cpu',
        1024, 'vec_memories', 'current'
      )
    `).run()
    getDb().prepare('INSERT INTO vec_memories(memory_id, embedding) VALUES (?, ?)')
      .run('mem_live_vector_coverage', Buffer.alloc(1024 * 4))
    const cases: RoadmapRagEvalCase[] = [{
      suite: 'live-rag',
      query: 'how are code vectors repaired',
      required_domains: ['vectors'],
      expected_sources: ['code:packages/memory/src/l2/code.ts'],
      expected_top_k: ['code:packages/memory/src/l2/code.ts'],
      thresholds: { recall_at_5: 1, provenance_coverage: 1, latency_p95_ms: 500 },
      tags: ['fixture'],
    }]

    const result = await runLiveRagEvalSuite({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      cases,
      required_domains: ['vectors'],
      retriever: async () => ({
        retrieved_sources: ['code:packages/memory/src/l2/code.ts'],
        context_sources: ['code:packages/memory/src/l2/code.ts'],
        cited_sources: ['code:packages/memory/src/l2/code.ts'],
        grounded: true,
        latency_ms: 42,
        query_trace_id: 'ragtrace_fixture_live',
      }),
    })

    expect(result.eval_run_id).toMatch(/^evalrun_/)
    expect(result).toMatchObject({
      suite: 'live-rag',
      status: 'passed',
      readiness: 'healthy',
      thresholds: expect.objectContaining({
        recall_at_5: 1,
        provenance_coverage: 1,
      }),
      metrics: expect.objectContaining({
        recall_at_5: 1,
        mrr: 1,
        ndcg: 1,
        context_precision: 1,
        context_recall: 1,
        groundedness: 1,
        provenance_coverage: 1,
        citation_accuracy: 1,
        latency_p95_ms: 42,
      }),
    })
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toMatchObject({
      status: 'passed',
      query_trace_id: 'ragtrace_fixture_live',
      missing_sources: [],
      failures: [],
    })

    const db = getDb()
    expect((db.prepare('SELECT COUNT(*) AS n FROM rag_eval_runs WHERE eval_run_id = ?')
      .get(result.eval_run_id) as { n: number }).n).toBe(1)
    expect((db.prepare('SELECT COUNT(*) AS n FROM rag_eval_cases WHERE suite = ?')
      .get('live-rag') as { n: number }).n).toBe(1)
    expect((db.prepare('SELECT COUNT(*) AS n FROM rag_eval_results WHERE eval_run_id = ?')
      .get(result.eval_run_id) as { n: number }).n).toBe(1)
  })

  it('fails live suites when required vector or graph coverage is empty even if retrieval succeeds', async () => {
    const result = await runLiveRagEvalSuite({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      required_domains: ['vectors', 'graph'],
      cases: [
        {
          suite: 'live-rag',
          query: 'vector coverage query',
          required_domains: ['vectors'],
          expected_sources: ['vector:expected'],
          thresholds: { recall_at_5: 1 },
        },
        {
          suite: 'live-rag',
          query: 'graph coverage query',
          required_domains: ['graph'],
          expected_sources: ['graph:expected'],
          thresholds: { recall_at_5: 1 },
        },
      ],
      retriever: async (testCase) => ({
        retrieved_sources: testCase.expected_sources,
        context_sources: testCase.expected_sources,
        cited_sources: testCase.expected_sources,
        grounded: true,
        latency_ms: 1,
      }),
    })

    expect(result.status).toBe('failed')
    expect(result.results.flatMap(row => row.failures.map(failure => failure.code))).toEqual(expect.arrayContaining([
      'vector_coverage_empty',
      'graph_coverage_empty',
    ]))
  })

  it('fails live vector coverage when current metadata is inconsistent with source freshness', async () => {
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, title, summary, entities, provenance
      ) VALUES (
        'mem_stale_vector_coverage', 'ws_1', 'proj_1', 'fact', 'project',
        'stale vector source', 'hash-current-source',
        3, 'stale vector coverage', 'stale vector coverage', '[]', '{}'
      )
    `).run()
    getDb().prepare(`
      INSERT INTO vector_metadata (
        vector_metadata_id, workspace_id, source_domain, source_id,
        content_hash, provider, model, requested_device, actual_device,
        dimensions, vector_table, status
      ) VALUES (
        'vecmeta_stale_vector_coverage', 'ws_1', 'memory', 'mem_stale_vector_coverage',
        'hash-stale-metadata', 'stub', 'stub', 'cpu', 'cpu',
        1024, 'vec_memories', 'current'
      )
    `).run()

    const result = await runLiveRagEvalSuite({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      required_domains: ['vectors'],
      cases: [{
        suite: 'live-rag',
        query: 'vector freshness query',
        required_domains: ['vectors'],
        expected_sources: ['vector:expected'],
        thresholds: { recall_at_5: 1 },
      }],
      retriever: async (testCase) => ({
        retrieved_sources: testCase.expected_sources,
        context_sources: testCase.expected_sources,
        cited_sources: testCase.expected_sources,
        grounded: true,
        latency_ms: 1,
      }),
    })

    expect(result.status).toBe('failed')
    expect(result.results[0]?.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'vector_coverage_degraded' }),
    ]))
  })

  it('redacts secrets and absolute paths from persisted eval artifacts', async () => {
    const result = await runLiveRagEvalSuite({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      required_domains: ['memory'],
      cases: [{
        suite: 'live-rag',
        query: 'inspect /home/mkh/private/source.ts token=sk-proj-secretsecretsecretsecretsecretsecretsecretsecret',
        required_domains: ['memory'],
        expected_sources: ['/home/mkh/private/source.ts'],
        thresholds: { recall_at_5: 1 },
      }],
      retriever: async () => ({
        retrieved_sources: [],
        context_sources: [],
        cited_sources: [],
        grounded: false,
        latency_ms: 1,
      }),
    })

    const persisted = getDb().prepare(`
      SELECT c.query, c.expected, r.missing_sources, r.failures, run.results
        FROM rag_eval_cases c
        JOIN rag_eval_results r ON r.eval_case_id = c.eval_case_id
        JOIN rag_eval_runs run ON run.eval_run_id = r.eval_run_id
       WHERE run.eval_run_id = ?
    `).get(result.eval_run_id) as Record<string, string>
    const raw = Object.values(persisted).join('\n')
    expect(JSON.stringify(result)).not.toContain('/home/')
    expect(JSON.stringify(result)).not.toContain('sk-proj')
    expect(raw).not.toContain('/home/')
    expect(raw).not.toContain('sk-proj')
    expect(raw).toContain('[REDACTED_PATH:')
  })

  it('marks missing expected cases in required live domains as degraded and non-passing', async () => {
    const result = await runLiveRagEvalSuite({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      cases: [{
        suite: 'live-rag',
        query: 'which graph edge connects repair and code vectors',
        required_domains: ['graph'],
        expected_sources: [],
        thresholds: { recall_at_5: 1, graph_coverage_required: true },
      }],
      retriever: async () => {
        throw new Error('retriever should not run missing expected cases')
      },
    })

    expect(result.status).toBe('failed')
    expect(result.readiness).toBe('degraded')
    expect(result.results[0]).toMatchObject({
      status: 'failed',
      missing_sources: ['graph'],
      failures: [expect.objectContaining({
        code: 'eval_expected_cases_missing',
        retryable: true,
      })],
    })
  })
})
