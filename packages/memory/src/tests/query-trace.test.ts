import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { persistRagQueryTrace, readRagQueryTrace } from '../retrieval/query-trace.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('RAG query trace redaction summary', () => {
  it('reports secret and absolute-path redaction independently', () => {
    const secretOnly = persistRagQueryTrace({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      query: 'token sk-proj-secretsecretsecretsecretsecretsecretsecretsecret',
      stages: [],
      fusion: {},
    }, getDb())
    const secretOnlyDetails = persistRagQueryTrace({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      query: 'plain query',
      stages: [],
      fusion: {},
      runtime_truth: {
        raw_env: 'OPENAI_API_KEY=sk-proj-secretsecretsecretsecretsecretsecretsecretsecret',
      },
    }, getDb())
    const withPath = persistRagQueryTrace({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      query: 'inspect /home/mkh/workspace/pi-stack-plan/src/index.ts',
      stages: [],
      fusion: {},
    }, getDb())
    const keyValuePath = persistRagQueryTrace({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      query: 'path=/home/mkh/workspace/pi-stack-plan/src/key-value.ts',
      stages: [],
      fusion: {},
    }, getDb())
    const quotedPath = persistRagQueryTrace({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      query: 'path="/home/mkh/workspace/pi-stack-plan/src/quoted.ts"',
      stages: [],
      fusion: {},
    }, getDb())
    const secretAndPath = persistRagQueryTrace({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      query: 'token=sk-proj-secretsecretsecretsecretsecretsecretsecretsecret file=/home/mkh/private/key',
      stages: [],
      fusion: {},
    }, getDb())

    expect(readRagQueryTrace({
      query_trace_id: secretOnly,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    })?.redaction_summary).toMatchObject({
      secrets_redacted: true,
      absolute_paths_redacted: false,
    })
    expect(readRagQueryTrace({
      query_trace_id: secretOnlyDetails,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    })?.redaction_summary).toMatchObject({
      secrets_redacted: true,
      absolute_paths_redacted: false,
    })
    expect(readRagQueryTrace({
      query_trace_id: withPath,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    })?.redaction_summary).toMatchObject({
      secrets_redacted: false,
      absolute_paths_redacted: true,
    })
    expect(readRagQueryTrace({
      query_trace_id: keyValuePath,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    })?.redaction_summary).toMatchObject({
      secrets_redacted: false,
      absolute_paths_redacted: true,
    })
    expect(readRagQueryTrace({
      query_trace_id: quotedPath,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    })?.redaction_summary).toMatchObject({
      secrets_redacted: false,
      absolute_paths_redacted: true,
    })
    expect(readRagQueryTrace({
      query_trace_id: secretAndPath,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    })?.redaction_summary).toMatchObject({
      secrets_redacted: true,
      absolute_paths_redacted: true,
    })
    const raw = getDb().prepare(`
      SELECT query_redacted
        FROM rag_query_traces
       WHERE query_trace_id = ?
    `).get(quotedPath) as { query_redacted: string }
    expect(raw.query_redacted).not.toContain('/home/')
  })

  it('persists explain details for stage counts, ranks, scores, fusion, runtime truth, freshness, and provenance', () => {
    const query_trace_id = persistRagQueryTrace({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      query: 'rank /home/mkh/workspace/pi-stack-plan/src/index.ts with token=super-secret-token',
      stages: [{
        name: 'code_vector',
        status: 'ok',
        candidate_count: 12,
        limit: 50,
        latency_ms: 17,
        ranks: [{ source_id: 'chunk_1', rank: 1, score: 0.91 }],
        score_summary: { max: 0.91, min: 0.22 },
      } as never, {
        name: 'graph',
        status: 'skipped',
        candidate_count: 0,
        limit: 25,
        latency_ms: 0,
        reason: 'graph assets unavailable',
      }],
      fusion: {
        method: 'rrf',
        input_candidates: 20,
        output_candidates: 5,
        score_by_source: { chunk_1: 0.91 },
      },
      rerank: {
        status: 'ok',
        candidate_limit: 5,
        latency_ms: 8,
        output_ranks: [{ source_id: 'chunk_1', rank: 1, score: 0.94 }],
      },
      runtime_truth: {
        requested: { provider: 'stub', model: 'stub', device: 'cpu', dimensions: 1024 },
        actual: { provider: 'stub', model: 'stub', device: 'cpu', dimensions: 1024 },
        fallback: null,
        raw_env: 'OPENAI_API_KEY=sk-proj-secretsecretsecretsecretsecretsecretsecretsecret',
      },
      freshness: {
        current: 1,
        stale: 0,
        failed: 0,
      },
      provenance: {
        source_refs: [{ file_path: '/home/mkh/private/file.ts', path_fingerprint: 'sha256:known' }],
        provenance_classes: { code_backed: 1 },
      },
      graph_contributions: [{
        mode: 'local',
        seed_count: 1,
        seed_ids: ['graph_seed_1'],
        expanded_entities: 1,
        expanded_edges: 1,
        contributed_result_ids: ['graph_edge_1'],
        changed_candidates: true,
        changed_ranking: true,
        changed_context_pack: false,
      }],
    }, getDb())

    const trace = readRagQueryTrace({
      query_trace_id,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    })

    expect(trace).toMatchObject({
      query_trace_id,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      stages: [
        expect.objectContaining({
          name: 'code_vector',
          candidate_count: 12,
          limit: 50,
          latency_ms: 17,
          ranks: [{ source_id: 'chunk_1', rank: 1, score: 0.91 }],
          score_summary: { max: 0.91, min: 0.22 },
        }),
        expect.objectContaining({
          name: 'graph',
          status: 'skipped',
          reason: 'graph assets unavailable',
        }),
      ],
      fusion: expect.objectContaining({
        method: 'rrf',
        input_candidates: 20,
        output_candidates: 5,
      }),
      rerank: expect.objectContaining({
        status: 'ok',
        latency_ms: 8,
      }),
      runtime_truth: expect.objectContaining({
        requested: expect.objectContaining({ provider: 'stub' }),
        actual: expect.objectContaining({ device: 'cpu' }),
      }),
      freshness: expect.objectContaining({ current: 1 }),
      provenance: expect.objectContaining({
        provenance_classes: { code_backed: 1 },
      }),
    })
    expect(trace?.graph_contributions[0]).toMatchObject({
      mode: 'local',
      changed_ranking: true,
    })

    const raw = getDb().prepare('SELECT query_redacted, runtime_truth, provenance FROM rag_query_traces WHERE query_trace_id = ?')
      .get(query_trace_id) as { query_redacted: string; runtime_truth: string; provenance: string }
    expect(raw.query_redacted).not.toContain('/home/')
    expect(raw.query_redacted).not.toContain('super-secret-token')
    expect(raw.runtime_truth).not.toContain('sk-proj')
    expect(raw.provenance).not.toContain('/home/')
  })
})
