import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, closeDb, newId, runMigrations, setDb } from 'fulcrum-agent-core'
import { startMonitorServer } from '../server.js'

let db: Database.Database
let server: ReturnType<typeof startMonitorServer>
let evalRunId: string
let traceId: string
let jobId: string

beforeEach(() => {
  db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_1', 'ws_1')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_1', 'ws_1', 'proj_1')").run()

  evalRunId = newId('rag_eval_run')
  traceId = newId('rag_query_trace')
  jobId = newId('embedding_job')
  db.prepare(`
    INSERT INTO rag_eval_runs (
      eval_run_id, workspace_id, project_id, suite, status, trigger_source,
      trigger_scope, gate_required, started_at, finished_at, results
    ) VALUES (?, 'ws_1', 'proj_1', 'live-rag', 'failed', 'local', 'manual', 1, datetime('now'), datetime('now'), ?)
  `).run(evalRunId, JSON.stringify({
    readiness: 'degraded',
    metrics: { recall_at_5: 0.5 },
    lane: {
      identity: { lane_id: 'python-ml', lane_type: 'challenger' },
      trust: { status: 'rejected', reasons: ['rollback proof missing'] },
      comparison: { baseline_lane_id: 'baseline-local', candidate_lane_id: 'python-ml' },
    },
  }))
  db.prepare(`
    INSERT INTO rag_eval_results (
      eval_result_id, eval_run_id, eval_case_id, workspace_id, project_id,
      status, query_trace_id, metrics, missing_sources, failures, latency_ms
    ) VALUES (?, ?, NULL, 'ws_1', 'proj_1', 'failed', ?, '{}', '["graph"]', '[]', 200)
  `).run(newId('rag_eval_result'), evalRunId, traceId)
  db.prepare(`
    INSERT INTO rag_coverage_records (
      coverage_id, workspace_id, project_id, source_domain, source_id,
      derived_domain, status, failure_code, failure_message
    ) VALUES (?, 'ws_1', 'proj_1', 'code_chunk', 'chunk_1', 'vector', 'failed', 'vector_missing', 'missing vector row at /home/mkh/private/vector.bin')
  `).run(newId('rag_coverage'))
  db.prepare(`
    INSERT INTO embedding_jobs (
      job_id, workspace_id, project_id, source_domain, status,
      requested_provider, requested_model, requested_device, dimensions, summary
    ) VALUES (?, 'ws_1', 'proj_1', 'code_chunks', 'degraded', 'stub', 'stub', 'cpu', 1024, '{"failed":1,"raw_env":"OPENAI_API_KEY=sk-proj-secretsecretsecretsecretsecretsecretsecretsecret"}')
  `).run(jobId)
  db.prepare(`
    INSERT INTO rag_query_traces (
      query_trace_id, workspace_id, project_id, query_hash, query_redacted,
      stages, fusion, rerank, runtime_truth, freshness, provenance, redaction_summary
    ) VALUES (?, 'ws_1', 'proj_1', 'hash', 'query', '[]', '{}', '{}', '{}', '{}', '{}', '{}')
  `).run(traceId)

  server = startMonitorServer({ workspace_id: 'ws_1', project_id: 'proj_1', bypass_auth: true })
})

afterEach(async () => {
  await server.stop()
  closeDb()
})

async function getJson(path: string): Promise<Record<string, unknown>> {
  const res = await server.fetch(new Request(`http://localhost${path}`)) as Response
  expect(res.status, path).toBe(200)
  return await res.json() as Record<string, unknown>
}

function totalChanges(): number {
  return (db.prepare('SELECT total_changes() AS n').get() as { n: number }).n
}

describe('RAG roadmap monitor readouts', () => {
  it('exposes read-only cards for health, eval runs, degraded domains, jobs, and traces', async () => {
    const before = totalChanges()

    const readouts = await getJson('/rag/readouts')
    expect(readouts).toMatchObject({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    })
    expect(readouts.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'rag_health' }),
      expect.objectContaining({ id: 'rag_eval_runs' }),
      expect.objectContaining({ id: 'rag_degraded_domains' }),
      expect.objectContaining({ id: 'rag_jobs' }),
      expect.objectContaining({ id: 'rag_query_traces' }),
    ]))

    const evalRuns = await getJson('/rag/eval-runs')
    expect(evalRuns.data).toEqual([expect.objectContaining({
      eval_run_id: evalRunId,
      suite: 'live-rag',
      results: expect.objectContaining({
        lane: expect.objectContaining({
          identity: expect.objectContaining({ lane_id: 'python-ml' }),
          trust: expect.objectContaining({ status: 'rejected' }),
        }),
      }),
    })])

    const degraded = await getJson('/rag/degraded-domains')
    expect(degraded.data).toEqual([expect.objectContaining({ derived_domain: 'vector', status: 'failed' })])

    const jobs = await getJson('/rag/jobs')
    expect(jobs.data).toEqual([expect.objectContaining({ job_id: jobId, status: 'degraded' })])

    const traces = await getJson('/rag/query-traces')
    expect(traces.data).toEqual([expect.objectContaining({ query_trace_id: traceId })])

    const serialized = JSON.stringify({ readouts, degraded, jobs, traces })
    expect(serialized).not.toContain('/home/')
    expect(serialized).not.toContain('sk-proj')

    expect(totalChanges()).toBe(before)
  })
})
