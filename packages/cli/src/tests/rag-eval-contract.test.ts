import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, closeDb, getDb, runMigrations, setDb } from 'fulcrum-agent-core'
import {
  authorizeRagEvalOperation,
  executeRagEvalCommand,
} from '../commands/memory-rag-eval.js'
import { getMemoryQueryTraceCommand } from '../commands/memory-query-trace.js'

beforeEach(() => {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_1', 'ws_1')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_1', 'ws_1', 'proj_1')").run()
})

afterEach(() => {
  closeDb()
})

describe('RAG eval CLI contract', () => {
  it('runs rag-lifecycle evals with stable JSON shape and audit events', async () => {
    const result = await executeRagEvalCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      suite: 'rag-lifecycle',
      actor: { kind: 'human', role: 'software_engineer', id: 'tester' },
    })

    expect(result).toMatchObject({
      suite: 'rag-lifecycle',
      status: 'passed',
      failures: [],
    })
    expect(result.eval_run_id).toMatch(/^evalrun_/)
    expect(result.results.retrieval_relevance.passed).toBeGreaterThan(0)
    expect(result.results.grounding_provenance.failed).toBe(0)

    const audit = getDb().prepare(`
      SELECT payload FROM events
       WHERE evt_type = 'rag_maintenance_audit'
       ORDER BY rowid DESC
       LIMIT 1
    `).get() as { payload: string }
    expect(JSON.parse(audit.payload)).toMatchObject({
      operation: 'eval',
      suite: 'rag-lifecycle',
      actor_role: 'software_engineer',
      authorized: true,
      authorization_reason: 'human_operator',
      eval_run_id: result.eval_run_id,
    })
  })

  it('authorizes expensive eval operations and audits denied actors', async () => {
    expect(authorizeRagEvalOperation({ kind: 'agent', role: 'software_engineer', id: 'agent' }).authorized).toBe(true)
    expect(authorizeRagEvalOperation({ kind: 'agent', role: 'code_reviewer', id: 'agent' }).authorized).toBe(false)

    await expect(executeRagEvalCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      suite: 'rag-lifecycle',
      actor: { kind: 'agent', role: 'code_reviewer', id: 'run_denied' },
    })).rejects.toThrow(/not authorized/)

    const audit = getDb().prepare(`
      SELECT payload FROM events
       WHERE evt_type = 'rag_maintenance_audit'
       ORDER BY rowid DESC
       LIMIT 1
    `).get() as { payload: string }
    expect(JSON.parse(audit.payload)).toMatchObject({
      operation: 'eval',
      actor_role: 'code_reviewer',
      authorized: false,
    })
  })

  it('rejects unsupported eval suites with a structured error', async () => {
    await expect(executeRagEvalCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      suite: 'unknown',
    })).rejects.toThrow(/unsupported eval suite/)
  })

  it('runs roadmap eval suites with readiness, thresholds, metrics, and result arrays', async () => {
    const result = await executeRagEvalCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      suite: 'live-rag',
      actor: { kind: 'human', role: 'software_engineer', id: 'tester' },
    })

    expect(result).toMatchObject({
      suite: 'live-rag',
      status: 'failed',
      readiness: 'degraded',
      lane: expect.objectContaining({
        identity: expect.objectContaining({
          lane_id: 'baseline-local',
          lane_type: 'baseline',
        }),
        trust: expect.objectContaining({
          status: 'degraded',
        }),
      }),
      thresholds: expect.objectContaining({ recall_at_5: 0.8 }),
      metrics: expect.objectContaining({ recall_at_5: 0 }),
      results: [],
    })
    expect(result.eval_run_id).toMatch(/^evalrun_/)
  })

  it('reads query traces only with explicit workspace and project scope', async () => {
    getDb().prepare(`
      INSERT INTO rag_query_traces (
        query_trace_id, workspace_id, project_id, query_hash, query_redacted,
        stages, fusion, rerank, runtime_truth, freshness, provenance, redaction_summary
      ) VALUES (
        'ragtrace_cli_scope', 'ws_1', 'proj_1', 'hash', 'query',
        '[]', '{}', '{}', '{}', '{}', '{}', '{}'
      )
    `).run()

    await expect(getMemoryQueryTraceCommand({
      query_trace_id: 'ragtrace_cli_scope',
      workspace_id: 'ws_1',
    }, getDb())).rejects.toThrow(/project_id required/)

    const trace = await getMemoryQueryTraceCommand({
      query_trace_id: 'ragtrace_cli_scope',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    }, getDb()) as { query_trace_id: string }

    expect(trace.query_trace_id).toBe('ragtrace_cli_scope')
  })
})
