import { getDb } from 'fulcrum-agent-core'
import type { Db } from 'fulcrum-agent-core'
import { redactRagDetails, redactRoadmapArtifact } from '../setup/rag-redaction.js'

export type RuntimeComparisonGateStatus = 'passed' | 'failed' | 'pending'

export interface RuntimeEvalSummary {
  eval_run_id: string
  status: string
  suite: string
  total: number
  passed: number
  failed: number
  skipped: number
  error: number
  pass_rate: number
  average_latency_ms: number | null
  p95_latency_ms: number | null
  resource_summary: Record<string, unknown>
}

export interface RuntimeComparisonGate {
  status: RuntimeComparisonGateStatus
  reason: string
  baseline?: number | null
  candidate?: number | null
  threshold?: number
}

export interface RuntimeComparisonResult {
  baseline_eval_run_id: string
  candidate_eval_run_id: string
  candidate_adapter?: string
  baseline: RuntimeEvalSummary
  candidate: RuntimeEvalSummary
  quality_delta: number
  latency_delta_ms: number | null
  latency_ratio: number | null
  resource_delta: Record<string, unknown>
  gates: {
    quality: RuntimeComparisonGate
    latency: RuntimeComparisonGate
  }
}

export interface CompareRuntimeEvalRunsInput {
  workspace_id: string
  project_id: string
  baseline_eval_run_id: string
  candidate_eval_run_id: string
  candidate_adapter?: string
  minimum_pass_rate_delta?: number
  latency_max_regression_ratio?: number
  baseline_resource_summary?: Record<string, unknown>
  candidate_resource_summary?: Record<string, unknown>
}

interface EvalRunRow {
  eval_run_id: string
  workspace_id: string
  project_id: string
  suite: string
  status: string
  results: string
}

interface EvalResultRow {
  status: 'passed' | 'failed' | 'skipped' | 'error'
  latency_ms: number | null
}

function sanitizeRuntimeComparison<T>(value: T): T {
  return redactRoadmapArtifact(redactRagDetails(value))
}

function readEvalRun(input: {
  eval_run_id: string
  workspace_id: string
  project_id: string
  label: 'baseline' | 'candidate'
}, db: Db): EvalRunRow {
  const row = db.prepare(`
    SELECT eval_run_id, workspace_id, project_id, suite, status, results
      FROM rag_eval_runs
     WHERE eval_run_id = ?
       AND workspace_id = ?
       AND project_id = ?
  `).get(input.eval_run_id, input.workspace_id, input.project_id) as EvalRunRow | undefined
  if (!row) throw new Error(`${input.label} eval run not found in workspace/project scope: ${input.eval_run_id}`)
  return row
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function readEvalSummary(
  run: EvalRunRow,
  db: Db,
  resourceOverride?: Record<string, unknown>,
): RuntimeEvalSummary {
  const rows = db.prepare(`
    SELECT status, latency_ms
      FROM rag_eval_results
     WHERE eval_run_id = ?
       AND workspace_id = ?
       AND project_id = ?
     ORDER BY created_at, eval_result_id
  `).all(run.eval_run_id, run.workspace_id, run.project_id) as EvalResultRow[]

  const counts = {
    passed: rows.filter(row => row.status === 'passed').length,
    failed: rows.filter(row => row.status === 'failed').length,
    skipped: rows.filter(row => row.status === 'skipped').length,
    error: rows.filter(row => row.status === 'error').length,
  }
  const total = rows.length
  const latencies = rows
    .map(row => row.latency_ms)
    .filter((latency): latency is number => typeof latency === 'number' && Number.isFinite(latency))
    .sort((a, b) => a - b)
  const average = latencies.length > 0
    ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
    : null
  const p95 = latencies.length > 0
    ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)]!
    : null
  const runResults = parseJsonObject(run.results)

  return sanitizeRuntimeComparison({
    eval_run_id: run.eval_run_id,
    status: run.status,
    suite: run.suite,
    total,
    ...counts,
    pass_rate: total > 0 ? counts.passed / total : 0,
    average_latency_ms: average,
    p95_latency_ms: p95,
    resource_summary: resourceOverride ?? (runResults['resource_summary'] as Record<string, unknown> | undefined) ?? {},
  })
}

function numericDelta(
  baseline: Record<string, unknown>,
  candidate: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, candidateValue] of Object.entries(candidate)) {
    const baselineValue = baseline[key]
    if (typeof candidateValue === 'number' && typeof baselineValue === 'number') {
      out[key] = candidateValue - baselineValue
    }
  }
  return out
}

export function compareRuntimeEvalRuns(input: CompareRuntimeEvalRunsInput, db: Db = getDb()): RuntimeComparisonResult {
  const baselineRun = readEvalRun({
    eval_run_id: input.baseline_eval_run_id,
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    label: 'baseline',
  }, db)
  const candidateRun = readEvalRun({
    eval_run_id: input.candidate_eval_run_id,
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    label: 'candidate',
  }, db)

  const baseline = readEvalSummary(baselineRun, db, input.baseline_resource_summary)
  const candidate = readEvalSummary(candidateRun, db, input.candidate_resource_summary)
  const minimumPassRateDelta = input.minimum_pass_rate_delta ?? 0
  const latencyBudget = input.latency_max_regression_ratio ?? 1.05
  const qualityDelta = candidate.pass_rate - baseline.pass_rate
  const qualityPassed = baseline.total > 0
    && candidate.total > 0
    && qualityDelta >= minimumPassRateDelta
    && candidate.error <= baseline.error
  const latencyRatio = baseline.average_latency_ms && candidate.average_latency_ms
    ? candidate.average_latency_ms / baseline.average_latency_ms
    : null
  const latencyDelta = baseline.average_latency_ms !== null && candidate.average_latency_ms !== null
    ? candidate.average_latency_ms - baseline.average_latency_ms
    : null
  const latencyPassed = latencyRatio === null ? false : latencyRatio <= latencyBudget

  return sanitizeRuntimeComparison({
    baseline_eval_run_id: input.baseline_eval_run_id,
    candidate_eval_run_id: input.candidate_eval_run_id,
    candidate_adapter: input.candidate_adapter,
    baseline,
    candidate,
    quality_delta: qualityDelta,
    latency_delta_ms: latencyDelta,
    latency_ratio: latencyRatio,
    resource_delta: numericDelta(baseline.resource_summary, candidate.resource_summary),
    gates: {
      quality: {
        status: qualityPassed ? 'passed' : 'failed',
        reason: qualityPassed ? 'candidate quality meets or exceeds baseline gate' : 'candidate quality regressed below baseline gate',
        baseline: baseline.pass_rate,
        candidate: candidate.pass_rate,
        threshold: baseline.pass_rate + minimumPassRateDelta,
      },
      latency: {
        status: latencyPassed ? 'passed' : 'failed',
        reason: latencyPassed ? 'candidate latency stays within regression budget' : 'candidate latency exceeds regression budget or lacks latency data',
        baseline: baseline.average_latency_ms,
        candidate: candidate.average_latency_ms,
        threshold: latencyBudget,
      },
    },
  })
}
