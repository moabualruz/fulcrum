import type {
  RoadmapRagEvalBaselineReference,
  RoadmapRagEvalLaneComparison,
  RoadmapRagEvalLaneIdentity,
  RoadmapRagEvalMetrics,
} from '../roadmap-types.js'

export interface CompareRoadmapEvalLanesInput {
  baseline: RoadmapRagEvalBaselineReference
  candidate: {
    lane: RoadmapRagEvalLaneIdentity
    metrics: RoadmapRagEvalMetrics
  }
}

const METRIC_KEYS: Array<keyof RoadmapRagEvalMetrics> = [
  'recall_at_5',
  'mrr',
  'ndcg',
  'context_precision',
  'context_recall',
  'groundedness',
  'provenance_coverage',
  'citation_accuracy',
  'latency_p50_ms',
  'latency_p95_ms',
]

export function compareRoadmapEvalLanes(input: CompareRoadmapEvalLanesInput): RoadmapRagEvalLaneComparison {
  const quality_delta = METRIC_KEYS.reduce<Partial<Record<keyof RoadmapRagEvalMetrics, number>>>((acc, key) => {
    acc[key] = input.candidate.metrics[key] - input.baseline.metrics[key]
    return acc
  }, {})

  const baselineLatency = input.baseline.metrics.latency_p95_ms
  const candidateLatency = input.candidate.metrics.latency_p95_ms
  return {
    baseline_lane_id: input.baseline.lane.lane_id,
    candidate_lane_id: input.candidate.lane.lane_id,
    quality_delta,
    latency_delta_ms: candidateLatency - baselineLatency,
    latency_ratio: baselineLatency > 0 ? candidateLatency / baselineLatency : null,
    same_contract: true,
  }
}
