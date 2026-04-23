import type { Db, RagEvalRunStatus, RagEvalSuite } from 'fulcrum-agent-core'

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

export type RoadmapRagEvalLaneType = 'baseline' | 'challenger'
export type RoadmapRagEvalLaneTrustStatus = 'trusted' | 'degraded' | 'rejected'
export type RoadmapRagEvalLaneGateStatus = 'passed' | 'failed' | 'skipped'
export type RoadmapRagEvalLaneGateName = 'lane_metadata' | 'quality' | 'latency' | 'live_coverage' | 'rollback'

export interface RoadmapRagEvalLaneIdentity {
  lane_id: string
  lane_label: string
  lane_type: RoadmapRagEvalLaneType
  runtime?: string
  adapter?: string
  metadata?: Record<string, unknown>
}

export interface RoadmapRagEvalLaneGate {
  gate: RoadmapRagEvalLaneGateName
  status: RoadmapRagEvalLaneGateStatus
  reason: string
  details?: Record<string, unknown>
}

export interface RoadmapRagEvalLaneComparison {
  baseline_lane_id: string
  candidate_lane_id: string
  quality_delta: Partial<Record<keyof RoadmapRagEvalMetrics, number>>
  latency_delta_ms: number | null
  latency_ratio: number | null
  same_contract: boolean
}

export interface RoadmapRagEvalRollbackProof {
  verified: boolean
  reference?: string
  notes?: string[]
}

export interface RoadmapRagEvalBaselineReference {
  lane: RoadmapRagEvalLaneIdentity
  metrics: RoadmapRagEvalMetrics
}

export interface RoadmapRagEvalLaneTrust {
  status: RoadmapRagEvalLaneTrustStatus
  reasons: string[]
  gates: RoadmapRagEvalLaneGate[]
}

export interface RoadmapRagEvalLaneResult {
  identity: RoadmapRagEvalLaneIdentity
  trust: RoadmapRagEvalLaneTrust
  comparison?: RoadmapRagEvalLaneComparison
}

export interface EvaluateRoadmapLaneTrustInput {
  lane: RoadmapRagEvalLaneIdentity
  metrics: RoadmapRagEvalMetrics
  readiness: RoadmapRagEvalReadiness
  thresholds: RoadmapRagEvalThresholds
  has_failures: boolean
  live_coverage_failures?: RoadmapRagEvalFailure[]
  comparison?: RoadmapRagEvalLaneComparison
  rollback_proof?: RoadmapRagEvalRollbackProof | null
}

export interface RoadmapRagEvalRunResult {
  eval_run_id: string
  suite: Exclude<RagEvalSuite, 'rag-lifecycle'>
  status: Exclude<RagEvalRunStatus, 'pending' | 'running' | 'cancelled'>
  readiness: RoadmapRagEvalReadiness
  lane: RoadmapRagEvalLaneResult
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
  lane?: Partial<RoadmapRagEvalLaneIdentity>
  baseline?: RoadmapRagEvalBaselineReference
  rollback_proof?: RoadmapRagEvalRollbackProof | null
  db?: Db
}
