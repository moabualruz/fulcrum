import { getDb, newId } from 'fulcrum-agent-core'
import type { Db, RagEvalRunStatus, RagEvalSuite } from 'fulcrum-agent-core'
import { redactRagDetails, redactRoadmapArtifact } from '../setup/rag-redaction.js'
import { evaluateRoadmapLaneTrust } from './roadmap/gates.js'
import { compareRoadmapEvalLanes } from './roadmap/lane-comparison.js'
import type {
  RoadmapRagEvalBaselineReference,
  RoadmapRagEvalLaneIdentity,
  RoadmapRagEvalLaneResult,
  RoadmapRagEvalRollbackProof,
} from './roadmap/contract.js'
import type {
  RagEvalReadinessResult,
  RoadmapRagEvalCase,
  RoadmapRagEvalCaseResult,
  RoadmapRagEvalDomain,
  RoadmapRagEvalFailure,
  RoadmapRagEvalMetricInput,
  RoadmapRagEvalMetrics,
  RoadmapRagEvalObservation,
  RoadmapRagEvalReadiness,
  RoadmapRagEvalRetriever,
  RoadmapRagEvalRunResult,
  RoadmapRagEvalThresholds,
  RunRoadmapRagEvalSuiteInput,
} from './roadmap-types.js'
import {
  DEFAULT_REQUIRED_DOMAINS,
  ZERO_METRICS,
  assessRagEvalReadiness,
  caseMetrics,
  computeRoadmapEvalMetrics,
  defaultRetriever,
  envAllows,
  liveCoverageFailures,
  loadPersistedCases,
  missingSources,
  normalizeLaneIdentity,
  normalizedCase,
  persistCase,
  persistResult,
  persistRunFinish,
  persistRunStart,
  redactEvalArtifact,
  skipFailure,
  thresholdFailures,
  thresholdsForSuite,
} from './roadmap/support.js'
export type {
  RagEvalReadinessResult,
  RoadmapRagEvalCase,
  RoadmapRagEvalCaseResult,
  RoadmapRagEvalDomain,
  RoadmapRagEvalFailure,
  RoadmapRagEvalMetricInput,
  RoadmapRagEvalMetrics,
  RoadmapRagEvalObservation,
  RoadmapRagEvalReadiness,
  RoadmapRagEvalRetriever,
  RoadmapRagEvalRunResult,
  RoadmapRagEvalThresholds,
  RunRoadmapRagEvalSuiteInput,
} from './roadmap-types.js'

export { computeRoadmapEvalMetrics, assessRagEvalReadiness } from './roadmap/support.js'

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
  const metrics = computeRoadmapEvalMetrics(metricRows, { k: 5 })
  const laneIdentity = normalizeLaneIdentity(input.lane)
  const comparison = laneIdentity.lane_type === 'challenger' && input.baseline
    ? compareRoadmapEvalLanes({
        baseline: input.baseline,
        candidate: { lane: laneIdentity, metrics },
      })
    : undefined
  const lane = {
    identity: laneIdentity,
    trust: evaluateRoadmapLaneTrust({
      lane: laneIdentity,
      metrics,
      readiness: readiness.status,
      thresholds,
      has_failures: hasFailingResult,
      live_coverage_failures: suiteCoverageFailures,
      comparison,
      rollback_proof: input.rollback_proof,
    }),
    comparison,
  } satisfies RoadmapRagEvalLaneResult
  const result = redactEvalArtifact({
    eval_run_id,
    suite: input.suite,
    status,
    readiness: readiness.status,
    lane,
    thresholds,
    metrics,
    results,
  }) as RoadmapRagEvalRunResult
  persistRunFinish(result, db)
  return result
}
