import { getDb, newId } from 'fulcrum-agent-core'
import type { Db, RagEvalRunStatus, RagEvalSuite } from 'fulcrum-agent-core'
import { redactRagDetails, redactRoadmapArtifact } from '../setup/rag-redaction.js'
import { reconcileVectorMetadata } from '../setup/rag-coverage.js'
import { readGraphEvidenceUnits } from '../graph/evidence.js'
import { searchCode } from '../retrieval/search-code.js'
import { searchContext } from '../retrieval/search-context.js'
import { ndcg, recallAtK } from './metrics.js'

export type RoadmapRagEvalReadiness = 'healthy' | 'degraded'
export type RoadmapRagEvalDomain =
  | 'memory'
  | 'code'
  | 'vectors'
  | 'graph'
  | 'provenance'
  | 'files'
  | 'fts'
  | 'eval_readiness'

export interface RoadmapRagEvalThresholds {
  recall_at_5?: number
  mrr?: number
  ndcg?: number
  context_precision?: number
  context_recall?: number
  groundedness?: number
  provenance_coverage?: number
  citation_accuracy?: number
  latency_p95_ms?: number
  graph_coverage_required?: boolean
  [key: string]: unknown
}

export interface RoadmapRagEvalFailure {
  code: string
  message: string
  details?: Record<string, unknown>
  retryable: boolean
}

export interface RoadmapRagEvalCase {
  eval_case_id?: string
  suite: RagEvalSuite
  case_type?: 'fixture' | 'live'
  query: string
  required_domains: RoadmapRagEvalDomain[]
  expected_sources: string[]
  expected_top_k?: string[]
  thresholds?: RoadmapRagEvalThresholds
  model_heavy?: boolean
  accelerator_heavy?: boolean
  status?: 'active' | 'disabled' | 'degraded'
  tags?: string[]
}

export interface RoadmapRagEvalObservation {
  retrieved_sources: string[]
  context_sources?: string[]
  cited_sources?: string[]
  grounded?: boolean
  latency_ms?: number
  query_trace_id?: string
}

export type RoadmapRagEvalRetriever = (
  testCase: RoadmapRagEvalCase
) => Promise<RoadmapRagEvalObservation> | RoadmapRagEvalObservation

export interface RoadmapRagEvalMetricInput {
  expected_sources: string[]
  retrieved_sources: string[]
  context_sources?: string[]
  cited_sources?: string[]
  grounded?: boolean
  latency_ms?: number
}

export interface RoadmapRagEvalMetrics {
  recall_at_5: number
  mrr: number
  ndcg: number
  context_precision: number
  context_recall: number
  groundedness: number
  provenance_coverage: number
  citation_accuracy: number
  latency_p50_ms: number
  latency_p95_ms: number
}

export interface RoadmapRagEvalCaseResult {
  eval_result_id: string
  eval_case_id: string
  status: 'passed' | 'failed' | 'skipped' | 'error'
  query_trace_id?: string
  metrics: RoadmapRagEvalMetrics
  missing_sources: string[]
  failures: RoadmapRagEvalFailure[]
  latency_ms: number
}

export interface RoadmapRagEvalRunResult {
  eval_run_id: string
  suite: Exclude<RagEvalSuite, 'rag-lifecycle'>
  status: Exclude<RagEvalRunStatus, 'pending' | 'running' | 'cancelled'>
  readiness: RoadmapRagEvalReadiness
  thresholds: RoadmapRagEvalThresholds
  metrics: RoadmapRagEvalMetrics
  results: RoadmapRagEvalCaseResult[]
}

export interface RagEvalReadinessResult {
  suite: RagEvalSuite
  status: RoadmapRagEvalReadiness
  missing_expected_case_domains: RoadmapRagEvalDomain[]
  failures: RoadmapRagEvalFailure[]
}

export interface RunRoadmapRagEvalSuiteInput {
  workspace_id: string
  project_id: string
  suite: Exclude<RagEvalSuite, 'rag-lifecycle'>
  cases?: RoadmapRagEvalCase[]
  required_domains?: RoadmapRagEvalDomain[]
  retriever?: RoadmapRagEvalRetriever
  include_model_heavy?: boolean
  include_accelerator_heavy?: boolean
  trigger_source?: 'local' | 'ci'
  trigger_scope?: 'rag_related' | 'non_rag' | 'manual'
  gate_required?: boolean
  db?: Db
}

const DEFAULT_THRESHOLDS: Record<Exclude<RagEvalSuite, 'rag-lifecycle'>, RoadmapRagEvalThresholds> = {
  'live-rag': {
    recall_at_5: 0.8,
    mrr: 0.7,
    ndcg: 0.7,
    context_precision: 0.7,
    context_recall: 0.7,
    groundedness: 1,
    provenance_coverage: 1,
    citation_accuracy: 1,
    latency_p95_ms: 1000,
    graph_coverage_required: true,
  },
  'code-rag': {
    recall_at_5: 0.8,
    mrr: 0.7,
    ndcg: 0.7,
    context_precision: 0.7,
    context_recall: 0.7,
    groundedness: 1,
    provenance_coverage: 1,
    citation_accuracy: 1,
    latency_p95_ms: 1000,
  },
  'unified-context': {
    recall_at_5: 0.8,
    mrr: 0.7,
    ndcg: 0.7,
    context_precision: 0.65,
    context_recall: 0.65,
    groundedness: 1,
    provenance_coverage: 1,
    citation_accuracy: 1,
    latency_p95_ms: 1200,
    graph_coverage_required: true,
  },
}

const DEFAULT_REQUIRED_DOMAINS: Record<Exclude<RagEvalSuite, 'rag-lifecycle'>, RoadmapRagEvalDomain[]> = {
  'live-rag': ['memory', 'code', 'vectors', 'graph', 'provenance'],
  'code-rag': ['code', 'vectors'],
  'unified-context': ['memory', 'code', 'graph'],
}

const ZERO_METRICS: RoadmapRagEvalMetrics = {
  recall_at_5: 0,
  mrr: 0,
  ndcg: 0,
  context_precision: 0,
  context_recall: 0,
  groundedness: 0,
  provenance_coverage: 0,
  citation_accuracy: 0,
  latency_p50_ms: 0,
  latency_p95_ms: 0,
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(percentileValue * sorted.length) - 1))
  return sorted[index] ?? 0
}

function reciprocalRank(expected: Set<string>, retrieved: string[]): number {
  const index = retrieved.findIndex(source => expected.has(source))
  return index < 0 ? 0 : 1 / (index + 1)
}

function countHits(expected: Set<string>, actual: string[] | undefined): number {
  if (!actual) return 0
  return actual.filter(source => expected.has(source)).length
}

export function computeRoadmapEvalMetrics(
  rows: RoadmapRagEvalMetricInput[],
  options: { k?: number } = {},
): RoadmapRagEvalMetrics {
  if (rows.length === 0) return { ...ZERO_METRICS }
  const k = options.k ?? 5
  let recall = 0
  let reciprocal = 0
  let ndcgScore = 0
  let contextHits = 0
  let contextTotal = 0
  let expectedTotal = 0
  let grounded = 0
  let provenanceCovered = 0
  let citedHits = 0
  let citedTotal = 0
  const latencies: number[] = []

  for (const row of rows) {
    const expected = new Set(row.expected_sources)
    recall += recallAtK(expected, row.retrieved_sources, k)
    reciprocal += reciprocalRank(expected, row.retrieved_sources)
    ndcgScore += ndcg(row.retrieved_sources, expected, k)
    contextHits += countHits(expected, row.context_sources)
    contextTotal += row.context_sources?.length ?? 0
    expectedTotal += expected.size
    if (row.grounded) grounded += 1
    if ((row.cited_sources?.length ?? 0) > 0) provenanceCovered += 1
    citedHits += countHits(expected, row.cited_sources)
    citedTotal += row.cited_sources?.length ?? 0
    latencies.push(row.latency_ms ?? 0)
  }

  return {
    recall_at_5: recall / rows.length,
    mrr: reciprocal / rows.length,
    ndcg: ndcgScore / rows.length,
    context_precision: contextTotal === 0 ? 0 : contextHits / contextTotal,
    context_recall: expectedTotal === 0 ? 0 : contextHits / expectedTotal,
    groundedness: grounded / rows.length,
    provenance_coverage: provenanceCovered / rows.length,
    citation_accuracy: citedTotal === 0 ? 0 : citedHits / citedTotal,
    latency_p50_ms: percentile(latencies, 0.5),
    latency_p95_ms: percentile(latencies, 0.95),
  }
}

export function assessRagEvalReadiness(input: {
  suite: RagEvalSuite
  required_domains: RoadmapRagEvalDomain[]
  cases: RoadmapRagEvalCase[]
}): RagEvalReadinessResult {
  const activeCases = input.cases.filter(testCase => (testCase.status ?? 'active') === 'active')
  const missing = input.required_domains.filter(domain => {
    return !activeCases.some(testCase =>
      testCase.required_domains.includes(domain) && testCase.expected_sources.length > 0,
    )
  })
  const failures = missing.map(domain => ({
    code: 'eval_expected_cases_missing',
    message: `Required eval domain has zero expected cases: ${domain}`,
    details: { domain },
    retryable: true,
  }))
  return {
    suite: input.suite,
    status: missing.length > 0 ? 'degraded' : 'healthy',
    missing_expected_case_domains: missing,
    failures,
  }
}

function thresholdsForSuite(
  suite: Exclude<RagEvalSuite, 'rag-lifecycle'>,
  cases: RoadmapRagEvalCase[],
): RoadmapRagEvalThresholds {
  return cases.reduce<RoadmapRagEvalThresholds>(
    (acc, testCase) => ({ ...acc, ...testCase.thresholds }),
    { ...DEFAULT_THRESHOLDS[suite] },
  )
}

function envAllows(name: string): boolean {
  return process.env[name] === '1' || process.env[name] === 'true'
}

function skipFailure(code: string, message: string): RoadmapRagEvalFailure {
  return { code, message, retryable: false }
}

function normalizedCase(suite: Exclude<RagEvalSuite, 'rag-lifecycle'>, testCase: RoadmapRagEvalCase): RoadmapRagEvalCase & { eval_case_id: string } {
  return {
    ...testCase,
    suite,
    eval_case_id: testCase.eval_case_id ?? newId('rag_eval_case'),
    case_type: testCase.case_type ?? 'live',
    status: testCase.status ?? 'active',
    tags: testCase.tags ?? [],
  }
}

function parseJson(value: unknown, fallback: unknown): unknown {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function redactEvalArtifact<T>(value: T): T {
  return redactRoadmapArtifact(redactRagDetails(value))
}

function loadPersistedCases(input: RunRoadmapRagEvalSuiteInput, db: Db): RoadmapRagEvalCase[] {
  const rows = db.prepare(`
    SELECT eval_case_id, suite, status, query, expected, tags, model_heavy, accelerator_heavy
      FROM rag_eval_cases
     WHERE workspace_id = ?
       AND project_id = ?
       AND suite = ?
     ORDER BY created_at ASC, eval_case_id ASC
  `).all(input.workspace_id, input.project_id, input.suite) as Array<Record<string, unknown>>
  return rows.map(row => {
    const expected = parseJson(row['expected'], {}) as Partial<RoadmapRagEvalCase>
    return {
      eval_case_id: row['eval_case_id'] as string,
      suite: row['suite'] as RagEvalSuite,
      status: row['status'] as RoadmapRagEvalCase['status'],
      query: row['query'] as string,
      case_type: expected.case_type ?? 'live',
      required_domains: expected.required_domains ?? [],
      expected_sources: expected.expected_sources ?? [],
      expected_top_k: expected.expected_top_k,
      thresholds: expected.thresholds,
      tags: parseJson(row['tags'], []) as string[],
      model_heavy: Boolean(row['model_heavy']),
      accelerator_heavy: Boolean(row['accelerator_heavy']),
    }
  })
}

function persistCase(input: {
  workspace_id: string
  project_id: string
  testCase: RoadmapRagEvalCase & { eval_case_id: string }
}, db: Db): void {
  const expected = redactEvalArtifact({
    case_type: input.testCase.case_type,
    required_domains: input.testCase.required_domains,
    expected_sources: input.testCase.expected_sources,
    expected_top_k: input.testCase.expected_top_k,
    thresholds: input.testCase.thresholds,
  })

  db.prepare(`
    INSERT INTO rag_eval_cases (
      eval_case_id, workspace_id, project_id, suite, status, query,
      expected, tags, model_heavy, accelerator_heavy, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(eval_case_id) DO UPDATE SET
      status = excluded.status,
      query = excluded.query,
      expected = excluded.expected,
      tags = excluded.tags,
      model_heavy = excluded.model_heavy,
      accelerator_heavy = excluded.accelerator_heavy,
      updated_at = datetime('now')
  `).run(
    input.testCase.eval_case_id,
    input.workspace_id,
    input.project_id,
    input.testCase.suite,
    input.testCase.status ?? 'active',
    redactEvalArtifact(input.testCase.query),
    JSON.stringify(expected),
    JSON.stringify(redactEvalArtifact(input.testCase.tags ?? [])),
    input.testCase.model_heavy ? 1 : 0,
    input.testCase.accelerator_heavy ? 1 : 0,
  )
}

function persistRunStart(input: RunRoadmapRagEvalSuiteInput & { eval_run_id: string }, db: Db): void {
  db.prepare(`
    INSERT INTO rag_eval_runs (
      eval_run_id, workspace_id, project_id, suite, status, trigger_source,
      trigger_scope, gate_required, started_at, results
    ) VALUES (?, ?, ?, ?, 'running', ?, ?, ?, datetime('now'), ?)
  `).run(
    input.eval_run_id,
    input.workspace_id,
    input.project_id,
    input.suite,
    input.trigger_source ?? 'local',
    input.trigger_scope ?? 'manual',
    input.gate_required ? 1 : 0,
    JSON.stringify({ suite: input.suite, status: 'running' }),
  )
}

function persistResult(input: {
  eval_run_id: string
  workspace_id: string
  project_id: string
  result: RoadmapRagEvalCaseResult
}, db: Db): void {
  const result = redactEvalArtifact(input.result)
  db.prepare(`
    INSERT INTO rag_eval_results (
      eval_result_id, eval_run_id, eval_case_id, workspace_id, project_id,
      status, query_trace_id, metrics, missing_sources, failures, latency_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.result.eval_result_id,
    input.eval_run_id,
    result.eval_case_id,
    input.workspace_id,
    input.project_id,
    result.status,
    result.query_trace_id ?? null,
    JSON.stringify(result.metrics),
    JSON.stringify(result.missing_sources),
    JSON.stringify(result.failures),
    result.latency_ms,
  )
}

function persistRunFinish(result: RoadmapRagEvalRunResult, db: Db): void {
  db.prepare(`
    UPDATE rag_eval_runs
       SET status = ?, finished_at = datetime('now'), results = ?
     WHERE eval_run_id = ?
  `).run(result.status, JSON.stringify(redactEvalArtifact(result)), result.eval_run_id)
}

function scopedVectorCoverage(input: RunRoadmapRagEvalSuiteInput, db: Db): { current: number; degraded: number; inconsistent: number } {
  const rows = db.prepare(`
    WITH scoped_vectors AS (
      SELECT v.status
        FROM vector_metadata v
        JOIN memories m ON m.memory_id = v.source_id AND m.workspace_id = v.workspace_id
       WHERE v.source_domain = 'memory'
         AND m.workspace_id = ?
         AND (m.project_id = ? OR m.project_id IS NULL)
      UNION ALL
      SELECT v.status
        FROM vector_metadata v
        JOIN code_chunks c ON c.chunk_id = v.source_id AND c.workspace_id = v.workspace_id
       WHERE v.source_domain = 'code_chunk'
         AND c.workspace_id = ?
         AND c.project_id = ?
    )
    SELECT status, COUNT(*) AS n
      FROM scoped_vectors
     GROUP BY status
  `).all(input.workspace_id, input.project_id, input.workspace_id, input.project_id) as Array<{ status: string; n: number }>
  const statusCounts = rows.reduce((acc, row) => {
    if (row.status === 'current') acc.current += row.n
    else acc.degraded += row.n
    return acc
  }, { current: 0, degraded: 0 })
  const reconciliation = reconcileVectorMetadata(input, db)
  return {
    ...statusCounts,
    inconsistent: reconciliation.missing_vector_rows
      + reconciliation.content_hash_mismatches
      + reconciliation.runtime_mismatches
      + reconciliation.freshness_mismatches,
  }
}

function liveCoverageFailures(
  input: RunRoadmapRagEvalSuiteInput,
  required_domains: RoadmapRagEvalDomain[],
  db: Db,
): RoadmapRagEvalFailure[] {
  if (input.suite !== 'live-rag') return []
  const failures: RoadmapRagEvalFailure[] = []
  if (required_domains.includes('vectors')) {
    const vectors = scopedVectorCoverage(input, db)
    if (vectors.current === 0) {
      failures.push({
        code: 'vector_coverage_empty',
        message: 'Required live vector coverage has no current rows',
        details: vectors,
        retryable: true,
      })
    } else if (vectors.degraded > 0 || vectors.inconsistent > 0) {
      failures.push({
        code: 'vector_coverage_degraded',
        message: 'Required live vector coverage has stale, failed, or inconsistent rows',
        details: vectors,
        retryable: true,
      })
    }
  }
  if (required_domains.includes('graph')) {
    const units = readGraphEvidenceUnits({ workspace_id: input.workspace_id, project_id: input.project_id }, db)
    const degraded = units.filter(unit => unit.freshness !== 'current').length
    if (units.length === 0) {
      failures.push({
        code: 'graph_coverage_empty',
        message: 'Required live graph coverage has no evidence units',
        details: { evidence_units: 0 },
        retryable: true,
      })
    } else if (degraded > 0) {
      failures.push({
        code: 'graph_coverage_degraded',
        message: 'Required live graph coverage has stale or failed evidence units',
        details: { evidence_units: units.length, degraded },
        retryable: true,
      })
    }
  }
  return failures
}

function defaultSourceIdFromContextResult(result: Awaited<ReturnType<typeof searchContext>>['results'][number]): string {
  return result.source_ref.graph_id
    ?? result.source_ref.source_id
    ?? result.source_ref.file_path
    ?? result.source_ref.task_id
    ?? result.title
}

async function defaultRetriever(
  testCase: RoadmapRagEvalCase,
  input: RunRoadmapRagEvalSuiteInput,
  db: Db,
): Promise<RoadmapRagEvalObservation> {
  const started = Date.now()
  if (input.suite === 'code-rag') {
    const code = await searchCode({
      workspace_id: input.workspace_id,
      project_id: input.project_id,
      text: testCase.query,
      limit: 5,
      explain: true,
    }, db)
    return {
      retrieved_sources: code.results.map(result => `code:${result.rel_path}`),
      context_sources: code.results.map(result => `code:${result.rel_path}`),
      cited_sources: code.results.length > 0 ? [`code:${code.results[0]!.rel_path}`] : [],
      grounded: code.results.length > 0,
      latency_ms: Date.now() - started,
      query_trace_id: code.query_trace_id,
    }
  }

  const context = await searchContext({
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    query: testCase.query,
    limit: 5,
    explain: true,
  }, db)
  const sources = context.results.map(defaultSourceIdFromContextResult)
  return {
    retrieved_sources: sources,
    context_sources: sources,
    cited_sources: sources.slice(0, 1),
    grounded: sources.length > 0,
    latency_ms: Date.now() - started,
    query_trace_id: context.query_trace_id,
  }
}

function missingSources(testCase: RoadmapRagEvalCase, observation: RoadmapRagEvalObservation): string[] {
  const retrieved = new Set(observation.retrieved_sources)
  return testCase.expected_sources.filter(source => !retrieved.has(source))
}

function thresholdFailures(metrics: RoadmapRagEvalMetrics, thresholds: RoadmapRagEvalThresholds): RoadmapRagEvalFailure[] {
  const failures: RoadmapRagEvalFailure[] = []
  const minimums: Array<keyof RoadmapRagEvalMetrics> = [
    'recall_at_5',
    'mrr',
    'ndcg',
    'context_precision',
    'context_recall',
    'groundedness',
    'provenance_coverage',
    'citation_accuracy',
  ]
  for (const key of minimums) {
    const threshold = thresholds[key]
    if (typeof threshold === 'number' && metrics[key] < threshold) {
      failures.push({
        code: 'eval_metric_below_threshold',
        message: `${key} below threshold`,
        details: { metric: key, actual: metrics[key], threshold },
        retryable: true,
      })
    }
  }
  if (typeof thresholds.latency_p95_ms === 'number' && metrics.latency_p95_ms > thresholds.latency_p95_ms) {
    failures.push({
      code: 'eval_latency_above_threshold',
      message: 'latency_p95_ms above threshold',
      details: { actual: metrics.latency_p95_ms, threshold: thresholds.latency_p95_ms },
      retryable: true,
    })
  }
  return failures
}

function caseMetrics(testCase: RoadmapRagEvalCase, observation: RoadmapRagEvalObservation): RoadmapRagEvalMetrics {
  return computeRoadmapEvalMetrics([{
    expected_sources: testCase.expected_sources,
    retrieved_sources: observation.retrieved_sources,
    context_sources: observation.context_sources,
    cited_sources: observation.cited_sources,
    grounded: observation.grounded,
    latency_ms: observation.latency_ms,
  }], { k: 5 })
}

export async function runRoadmapRagEvalSuite(input: RunRoadmapRagEvalSuiteInput): Promise<RoadmapRagEvalRunResult> {
  const db = input.db ?? getDb()
  const eval_run_id = newId('rag_eval_run')
  const rawCases = input.cases ?? loadPersistedCases(input, db)
  const cases = rawCases.map(testCase => normalizedCase(input.suite, testCase))
  const thresholds = thresholdsForSuite(input.suite, cases)
  const required_domains = input.required_domains ?? DEFAULT_REQUIRED_DOMAINS[input.suite]
  const readiness = assessRagEvalReadiness({ suite: input.suite, required_domains, cases })
  const suiteCoverageFailures = liveCoverageFailures(input, required_domains, db)
  const results: RoadmapRagEvalCaseResult[] = []
  const metricRows: RoadmapRagEvalMetricInput[] = []
  const allowModelHeavy = input.include_model_heavy === true || envAllows('FULCRUM_RAG_EVAL_MODEL_HEAVY')
  const allowAcceleratorHeavy = input.include_accelerator_heavy === true || envAllows('FULCRUM_RAG_EVAL_ACCELERATOR_HEAVY')

  persistRunStart({ ...input, eval_run_id }, db)
  for (const testCase of cases) persistCase({ workspace_id: input.workspace_id, project_id: input.project_id, testCase }, db)

  for (const testCase of cases) {
    if (testCase.status === 'disabled') {
      results.push({
        eval_result_id: newId('rag_eval_result'),
        eval_case_id: testCase.eval_case_id,
        status: 'skipped',
        metrics: { ...ZERO_METRICS },
        missing_sources: [],
        failures: [skipFailure('eval_case_disabled', 'eval case disabled')],
        latency_ms: 0,
      })
      continue
    }
    if (testCase.model_heavy && !allowModelHeavy) {
      results.push({
        eval_result_id: newId('rag_eval_result'),
        eval_case_id: testCase.eval_case_id,
        status: 'skipped',
        metrics: { ...ZERO_METRICS },
        missing_sources: [],
        failures: [skipFailure('model_heavy_eval_skipped', 'model-heavy eval skipped by default')],
        latency_ms: 0,
      })
      continue
    }
    if (testCase.accelerator_heavy && !allowAcceleratorHeavy) {
      results.push({
        eval_result_id: newId('rag_eval_result'),
        eval_case_id: testCase.eval_case_id,
        status: 'skipped',
        metrics: { ...ZERO_METRICS },
        missing_sources: [],
        failures: [skipFailure('accelerator_heavy_eval_skipped', 'accelerator-heavy eval skipped by default')],
        latency_ms: 0,
      })
      continue
    }
    if (testCase.required_domains.length > 0 && testCase.expected_sources.length === 0) {
      results.push({
        eval_result_id: newId('rag_eval_result'),
        eval_case_id: testCase.eval_case_id,
        status: 'failed',
        metrics: { ...ZERO_METRICS },
        missing_sources: testCase.required_domains,
        failures: [{
          code: 'eval_expected_cases_missing',
          message: 'Required live eval case has no expected sources',
          details: { domains: testCase.required_domains },
          retryable: true,
        }],
        latency_ms: 0,
      })
      continue
    }

    try {
      const observation = input.retriever
        ? await input.retriever(testCase)
        : await defaultRetriever(testCase, input, db)
      const metrics = caseMetrics(testCase, observation)
      const missing = missingSources(testCase, observation)
      const failures = [
        ...missing.map(source => ({
          code: 'expected_source_missing',
          message: 'Required source was not retrieved',
          details: { source },
          retryable: true,
        })),
        ...thresholdFailures(metrics, { ...thresholds, ...testCase.thresholds }),
        ...suiteCoverageFailures,
      ]
      const status = failures.length > 0 ? 'failed' : 'passed'
      metricRows.push({
        expected_sources: testCase.expected_sources,
        retrieved_sources: observation.retrieved_sources,
        context_sources: observation.context_sources,
        cited_sources: observation.cited_sources,
        grounded: observation.grounded,
        latency_ms: observation.latency_ms,
      })
      results.push({
        eval_result_id: newId('rag_eval_result'),
        eval_case_id: testCase.eval_case_id,
        status,
        query_trace_id: observation.query_trace_id,
        metrics,
        missing_sources: missing,
        failures,
        latency_ms: observation.latency_ms ?? 0,
      })
    } catch (error) {
      results.push({
        eval_result_id: newId('rag_eval_result'),
        eval_case_id: testCase.eval_case_id,
        status: 'error',
        metrics: { ...ZERO_METRICS },
        missing_sources: testCase.expected_sources,
        failures: [{
          code: 'eval_case_error',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
        }],
        latency_ms: 0,
      })
    }
  }

  for (const result of results) {
    persistResult({ eval_run_id, workspace_id: input.workspace_id, project_id: input.project_id, result }, db)
  }

  const hasFailingResult = results.some(result => result.status === 'failed' || result.status === 'error')
  const status = readiness.status === 'degraded' || suiteCoverageFailures.length > 0 || hasFailingResult ? 'failed' : 'passed'
  const result = redactEvalArtifact({
    eval_run_id,
    suite: input.suite,
    status,
    readiness: readiness.status,
    thresholds,
    metrics: computeRoadmapEvalMetrics(metricRows, { k: 5 }),
    results,
  }) as RoadmapRagEvalRunResult
  persistRunFinish(result, db)
  return result
}
