import type {
  RoadmapRagEvalFailure,
  RoadmapRagEvalMetrics,
  RoadmapRagEvalReadiness,
  RoadmapRagEvalThresholds,
} from '../roadmap.js'

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
