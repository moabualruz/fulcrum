import type {
  EvaluateRoadmapLaneTrustInput,
  RoadmapRagEvalLaneGate,
  RoadmapRagEvalLaneTrust,
} from './contract.js'

function gate(
  status: RoadmapRagEvalLaneGate['status'],
  name: RoadmapRagEvalLaneGate['gate'],
  reason: string,
  details?: Record<string, unknown>,
): RoadmapRagEvalLaneGate {
  return { gate: name, status, reason, details }
}

export function evaluateRoadmapLaneTrust(input: EvaluateRoadmapLaneTrustInput): RoadmapRagEvalLaneTrust {
  const gates: RoadmapRagEvalLaneGate[] = []
  const laneId = input.lane.lane_id.trim()
  const laneLabel = input.lane.lane_label.trim()
  const metadataOk = laneId.length > 0
    && laneLabel.length > 0
    && (input.lane.lane_type === 'baseline'
      ? (input.lane.runtime?.trim().length ?? 0) > 0
      : (input.lane.adapter?.trim().length ?? 0) > 0)
  gates.push(
    metadataOk
      ? gate('passed', 'lane_metadata', 'lane metadata is complete')
      : gate('failed', 'lane_metadata', 'lane metadata is incomplete or malformed', {
          lane_id: input.lane.lane_id,
          lane_label: input.lane.lane_label,
          lane_type: input.lane.lane_type,
        }),
  )

  const qualityOk = !input.has_failures
  gates.push(
    qualityOk
      ? gate('passed', 'quality', 'lane meets fixture and live quality requirements')
      : gate('failed', 'quality', 'lane has failing eval cases or threshold regressions'),
  )

  const latencyThreshold = input.thresholds.latency_p95_ms
  const latencyOk = typeof latencyThreshold !== 'number' || input.metrics.latency_p95_ms <= latencyThreshold
  gates.push(
    latencyOk
      ? gate('passed', 'latency', 'lane latency stays within accepted threshold', {
          latency_p95_ms: input.metrics.latency_p95_ms,
          threshold: latencyThreshold,
        })
      : gate('failed', 'latency', 'lane latency exceeds accepted threshold', {
          latency_p95_ms: input.metrics.latency_p95_ms,
          threshold: latencyThreshold,
          baseline_latency_p95_ms: input.comparison && input.comparison.latency_delta_ms !== null
            ? input.metrics.latency_p95_ms - input.comparison.latency_delta_ms
            : undefined,
        }),
  )

  const coverageOk = input.readiness === 'healthy' && (input.live_coverage_failures?.length ?? 0) === 0
  gates.push(
    coverageOk
      ? gate('passed', 'live_coverage', 'required live coverage domains are healthy')
      : gate('failed', 'live_coverage', 'required live coverage domains are degraded', {
          readiness: input.readiness,
          failures: input.live_coverage_failures?.map(failure => failure.code) ?? [],
        }),
  )

  if (input.lane.lane_type === 'challenger') {
    const rollbackOk = input.rollback_proof?.verified === true
    gates.push(
      rollbackOk
        ? gate('passed', 'rollback', 'challenger lane has verified rollback proof', {
            reference: input.rollback_proof?.reference,
          })
        : gate('failed', 'rollback', 'challenger lane is missing verified rollback proof'),
    )
  } else {
    gates.push(gate('skipped', 'rollback', 'baseline lane does not require rollback proof'))
  }

  const rejected = gates.some(result =>
    result.status === 'failed'
      && (result.gate === 'lane_metadata' || result.gate === 'quality' || result.gate === 'latency' || result.gate === 'rollback'),
  )
  const degraded = !rejected && gates.some(result => result.status === 'failed' && result.gate === 'live_coverage')
  const reasons = gates.filter(result => result.status === 'failed').map(result => result.reason)

  return {
    status: rejected ? 'rejected' : degraded ? 'degraded' : 'trusted',
    reasons,
    gates,
  }
}
