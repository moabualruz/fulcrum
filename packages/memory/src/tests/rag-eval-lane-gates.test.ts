import { describe, expect, it } from 'vitest'
import {
  compareRoadmapEvalLanes,
  evaluateRoadmapLaneTrust,
  type RoadmapRagEvalLaneIdentity,
  type RoadmapRagEvalMetrics,
} from '../eval/index.js'

function lane(overrides: Partial<RoadmapRagEvalLaneIdentity> = {}): RoadmapRagEvalLaneIdentity {
  return {
    lane_id: 'baseline-local',
    lane_label: 'Local baseline',
    lane_type: 'baseline',
    runtime: 'local',
    ...overrides,
  }
}

function metrics(overrides: Partial<RoadmapRagEvalMetrics> = {}): RoadmapRagEvalMetrics {
  return {
    recall_at_5: 0.9,
    mrr: 0.8,
    ndcg: 0.85,
    context_precision: 0.9,
    context_recall: 0.9,
    groundedness: 1,
    provenance_coverage: 1,
    citation_accuracy: 1,
    latency_p50_ms: 100,
    latency_p95_ms: 150,
    ...overrides,
  }
}

describe('roadmap eval lane trust gates', () => {
  it('compares baseline and challenger lanes under one contract', () => {
    const comparison = compareRoadmapEvalLanes({
      baseline: {
        lane: lane(),
        metrics: metrics({ recall_at_5: 0.8, latency_p95_ms: 140 }),
      },
      candidate: {
        lane: lane({
          lane_id: 'python-ml',
          lane_label: 'Python ML challenger',
          lane_type: 'challenger',
          adapter: 'python-ml',
        }),
        metrics: metrics({ recall_at_5: 0.92, latency_p95_ms: 165 }),
      },
    })

    expect(comparison).toMatchObject({
      baseline_lane_id: 'baseline-local',
      candidate_lane_id: 'python-ml',
      quality_delta: expect.objectContaining({ recall_at_5: 0.12 }),
      latency_delta_ms: 25,
      same_contract: true,
    })
  })

  it('rejects malformed challenger metadata instead of trusting implicitly', () => {
    const trust = evaluateRoadmapLaneTrust({
      lane: {
        lane_id: '',
        lane_label: 'Broken challenger',
        lane_type: 'challenger',
      } as RoadmapRagEvalLaneIdentity,
      metrics: metrics(),
      readiness: 'healthy',
      has_failures: false,
      thresholds: { latency_p95_ms: 200 },
    })

    expect(trust.status).toBe('rejected')
    expect(trust.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ gate: 'lane_metadata', status: 'failed' }),
    ]))
  })

  it('rejects a challenger with better quality when latency regresses too far or rollback proof is missing', () => {
    const trust = evaluateRoadmapLaneTrust({
      lane: lane({
        lane_id: 'rust-search',
        lane_label: 'Rust challenger',
        lane_type: 'challenger',
        adapter: 'rust-search',
      }),
      metrics: metrics({ recall_at_5: 0.95, latency_p95_ms: 220 }),
      readiness: 'healthy',
      has_failures: false,
      thresholds: { latency_p95_ms: 180 },
      comparison: compareRoadmapEvalLanes({
        baseline: {
          lane: lane(),
          metrics: metrics({ recall_at_5: 0.85, latency_p95_ms: 150 }),
        },
        candidate: {
          lane: lane({
            lane_id: 'rust-search',
            lane_label: 'Rust challenger',
            lane_type: 'challenger',
            adapter: 'rust-search',
          }),
          metrics: metrics({ recall_at_5: 0.95, latency_p95_ms: 220 }),
        },
      }),
      rollback_proof: { verified: false },
    })

    expect(trust.status).toBe('rejected')
    expect(trust.reasons).toEqual(expect.arrayContaining([
      expect.stringMatching(/latency/i),
      expect.stringMatching(/rollback/i),
    ]))
  })

  it('marks required live coverage degradation as degraded even when metrics pass', () => {
    const trust = evaluateRoadmapLaneTrust({
      lane: lane(),
      metrics: metrics(),
      readiness: 'degraded',
      has_failures: false,
      thresholds: { latency_p95_ms: 200 },
      live_coverage_failures: [{
        code: 'graph_coverage_degraded',
        message: 'graph coverage degraded',
        retryable: true,
      }],
    })

    expect(trust.status).toBe('degraded')
    expect(trust.gates).toEqual(expect.arrayContaining([
      expect.objectContaining({ gate: 'live_coverage', status: 'failed' }),
    ]))
  })
})
