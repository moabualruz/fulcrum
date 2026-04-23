import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import { compareRuntimeEvalRuns } from '../runtime/comparison.js'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'

function insertEvalRun(input: {
  eval_run_id: string
  workspace_id?: string
  project_id?: string
  status?: 'passed' | 'failed'
  resultStatuses: Array<'passed' | 'failed' | 'skipped' | 'error'>
  latencies: number[]
  results?: Record<string, unknown>
}): void {
  const db = getDb()
  const workspace_id = input.workspace_id ?? 'ws_1'
  const project_id = input.project_id ?? 'proj_1'
  db.prepare(`
    INSERT INTO rag_eval_runs (
      eval_run_id, workspace_id, project_id, suite, status, trigger_source,
      trigger_scope, gate_required, started_at, finished_at, results
    ) VALUES (?, ?, ?, 'live-rag', ?, 'local', 'manual', 1, datetime('now'), datetime('now'), ?)
  `).run(input.eval_run_id, workspace_id, project_id, input.status ?? 'passed', JSON.stringify(input.results ?? {}))

  input.resultStatuses.forEach((status, idx) => {
    db.prepare(`
      INSERT INTO rag_eval_results (
        eval_result_id, eval_run_id, workspace_id, project_id, status, metrics, failures, latency_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `${input.eval_run_id}_result_${idx}`,
      input.eval_run_id,
      workspace_id,
      project_id,
      status,
      JSON.stringify({ recall_at_5: status === 'passed' ? 1 : 0 }),
      JSON.stringify(status === 'passed' ? [] : [{ code: 'case_failed' }]),
      input.latencies[idx] ?? null,
    )
  })
}

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('runtime baseline-vs-candidate comparison', () => {
  it('computes quality and latency gates from scoped eval run IDs', () => {
    insertEvalRun({
      eval_run_id: 'evalrun_baseline',
      resultStatuses: ['passed', 'passed'],
      latencies: [120, 140],
      results: { resource_summary: { memory_mb: 100 } },
    })
    insertEvalRun({
      eval_run_id: 'evalrun_candidate',
      resultStatuses: ['passed', 'failed'],
      latencies: [80, 90],
      results: { resource_summary: { memory_mb: 120 } },
    })

    const comparison = compareRuntimeEvalRuns({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      baseline_eval_run_id: 'evalrun_baseline',
      candidate_eval_run_id: 'evalrun_candidate',
      candidate_adapter: 'candidate-vector',
      latency_max_regression_ratio: 1.1,
    })

    expect(comparison).toMatchObject({
      baseline_eval_run_id: 'evalrun_baseline',
      candidate_eval_run_id: 'evalrun_candidate',
      candidate_adapter: 'candidate-vector',
      gates: {
        quality: { status: 'failed' },
        latency: { status: 'passed' },
      },
    })
    expect(comparison.baseline.pass_rate).toBe(1)
    expect(comparison.candidate.pass_rate).toBe(0.5)
    expect(comparison.latency_delta_ms).toBe(-45)
  })

  it('does not read eval runs outside the requested workspace/project scope', () => {
    seedWorkspaceAndProject(getDb(), 'ws_2', 'proj_2')
    insertEvalRun({ eval_run_id: 'evalrun_baseline', resultStatuses: ['passed'], latencies: [50] })
    insertEvalRun({
      eval_run_id: 'evalrun_candidate_other_scope',
      workspace_id: 'ws_2',
      project_id: 'proj_2',
      resultStatuses: ['passed'],
      latencies: [40],
    })

    expect(() => compareRuntimeEvalRuns({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      baseline_eval_run_id: 'evalrun_baseline',
      candidate_eval_run_id: 'evalrun_candidate_other_scope',
    })).toThrow(/candidate eval run not found/)
  })

  it('fails quality closed when candidate eval has no result rows', () => {
    insertEvalRun({
      eval_run_id: 'evalrun_baseline',
      resultStatuses: ['passed'],
      latencies: [50],
    })
    insertEvalRun({
      eval_run_id: 'evalrun_empty_candidate',
      status: 'passed',
      resultStatuses: [],
      latencies: [],
    })

    const comparison = compareRuntimeEvalRuns({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      baseline_eval_run_id: 'evalrun_baseline',
      candidate_eval_run_id: 'evalrun_empty_candidate',
    })

    expect(comparison.candidate.total).toBe(0)
    expect(comparison.candidate.pass_rate).toBe(0)
    expect(comparison.gates.quality.status).toBe('failed')
  })

  it('redacts path-like and secret-like resource details', () => {
    insertEvalRun({ eval_run_id: 'evalrun_baseline', resultStatuses: ['passed'], latencies: [50] })
    insertEvalRun({ eval_run_id: 'evalrun_candidate', resultStatuses: ['passed'], latencies: [45] })

    const comparison = compareRuntimeEvalRuns({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      baseline_eval_run_id: 'evalrun_baseline',
      candidate_eval_run_id: 'evalrun_candidate',
      candidate_resource_summary: {
        cache_path: '/home/alice/private/vector-cache',
        token: 'sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    })

    const json = JSON.stringify(comparison)
    expect(json).not.toContain('/home/alice')
    expect(json).not.toContain('sk-proj-')
    expect(json).toContain('[REDACTED_PATH:sha256:')
  })
})
