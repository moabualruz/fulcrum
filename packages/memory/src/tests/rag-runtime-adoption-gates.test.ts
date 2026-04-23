import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import {
  adoptRuntimeExperiment,
  buildRuntimeExperimentReport,
  createRuntimeExperiment,
  evaluateRuntimeAdoptionGates,
} from '../runtime/experiments.js'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'

const PASSING_GATES = {
  quality: { status: 'passed', reason: 'candidate matches baseline eval quality' },
  latency: { status: 'passed', reason: 'candidate stays within latency budget' },
  rollback: { status: 'passed', command: 'fulcrum memory runtime-experiments rollback runtimeexp_safe' },
  local_first: { status: 'passed', remote_required: false },
  agent_tool_parity: { status: 'passed', missing_tools: [] },
  operational_risk: { status: 'passed', risk_level: 'low' },
} as const

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('runtime experiment adoption gates', () => {
  it('requires quality, latency, rollback, local-first, agent/tool parity, and risk gates before adoption', () => {
    const experiment = createRuntimeExperiment({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      status: 'completed',
      experiment_type: 'vector_store',
      baseline_eval_run_id: 'evalrun_baseline',
      candidate_adapter: 'candidate-vector',
      adoption_gates: PASSING_GATES,
      rollback_plan: { command: 'fulcrum memory rebuild --all --execute --json' },
    })

    expect(evaluateRuntimeAdoptionGates(experiment).can_adopt).toBe(true)

    const adopted = adoptRuntimeExperiment({
      runtime_experiment_id: experiment.runtime_experiment_id,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    })

    expect(adopted.status).toBe('adopted')
    expect(adopted.adoption_gates.quality.status).toBe('passed')
  })

  it('rejects adoption when rollback, local-first, or agent parity gates are missing or failed', () => {
    const experiment = createRuntimeExperiment({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      status: 'completed',
      experiment_type: 'model_runtime',
      baseline_eval_run_id: 'evalrun_baseline',
      candidate_adapter: 'remote-model',
      adoption_gates: {
        quality: { status: 'passed' },
        latency: { status: 'passed' },
        rollback: { status: 'failed', reason: 'rollback plan not proven' },
        local_first: { status: 'failed', remote_required: true },
      },
      rollback_plan: {},
    })

    const gateResult = evaluateRuntimeAdoptionGates(experiment)
    expect(gateResult.can_adopt).toBe(false)
    expect(gateResult.blocking_gates).toEqual(expect.arrayContaining(['rollback', 'local_first', 'agent_tool_parity', 'operational_risk']))

    expect(() => adoptRuntimeExperiment({
      runtime_experiment_id: experiment.runtime_experiment_id,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    })).toThrow(/cannot adopt runtime experiment/)

    const row = getDb().prepare('SELECT status FROM runtime_experiments WHERE runtime_experiment_id = ?')
      .get(experiment.runtime_experiment_id) as { status: string }
    expect(row.status).toBe('rejected')
  })

  it('requires explicit proof fields for local-first, agent parity, and risk gates', () => {
    const experiment = createRuntimeExperiment({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      status: 'completed',
      experiment_type: 'vector_store',
      baseline_eval_run_id: 'evalrun_baseline',
      candidate_adapter: 'candidate-vector',
      adoption_gates: {
        quality: { status: 'passed' },
        latency: { status: 'passed' },
        rollback: { status: 'passed', command: 'fulcrum memory runtime-experiments rollback runtimeexp_safe' },
        local_first: { status: 'passed' },
        agent_tool_parity: { status: 'passed' },
        operational_risk: { status: 'passed' },
      },
      rollback_plan: { command: 'fulcrum memory runtime-experiments rollback runtimeexp_safe' },
    })

    const gateResult = evaluateRuntimeAdoptionGates(experiment)

    expect(gateResult.can_adopt).toBe(false)
    expect(gateResult.blocking_gates).toEqual(expect.arrayContaining([
      'local_first',
      'agent_tool_parity',
      'operational_risk',
    ]))
  })

  it('reports disabled optional experiments as out_of_scope with no local baseline impact', () => {
    const experiment = createRuntimeExperiment({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      experiment_type: 'graph_store',
      candidate_adapter: '/home/alice/private/kuzu-candidate',
      adoption_gates: {},
      risk_notes: ['No configured optional runtime; local baseline stays active. secret=super-secret-value'],
    })

    const report = buildRuntimeExperimentReport({
      runtime_experiment_id: experiment.runtime_experiment_id,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    })

    expect(report).toMatchObject({
      status: 'disabled',
      availability: {
        status: 'disabled',
        scope: 'out_of_scope',
        local_baseline_impact: 'none',
      },
      adoption: {
        can_adopt: false,
      },
    })
    const json = JSON.stringify(report)
    expect(json).not.toContain('/home/alice')
    expect(json).not.toContain('super-secret-value')
  })

  it('reports challenger lane contract details through the shared planner/eval model', () => {
    const experiment = createRuntimeExperiment({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      status: 'completed',
      experiment_type: 'model_runtime',
      baseline_eval_run_id: 'evalrun_baseline',
      candidate_adapter: 'python-ml',
      adoption_gates: PASSING_GATES,
      rollback_plan: { command: 'fulcrum memory runtime-experiments rollback runtimeexp_python' },
    })

    const report = buildRuntimeExperimentReport({
      runtime_experiment_id: experiment.runtime_experiment_id,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    })

    expect(report.lane).toMatchObject({
      lane_id: 'python-ml',
      lane_type: 'challenger',
      adapter: 'python-ml',
    })
    expect(report.lane_contract).toMatchObject({
      contract_version: 'rag-challenger-v1',
      eval_contract: 'roadmap-rag-eval-v1',
      explain_contract: 'shared-rag-explain-v1',
      disabled_by_default: true,
      status: 'registered',
    })
  })

  it('fails closed when a registered challenger name does not match the persisted experiment type', () => {
    const experiment = createRuntimeExperiment({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      status: 'completed',
      experiment_type: 'graph_store',
      candidate_adapter: 'python-ml',
      adoption_gates: PASSING_GATES,
      rollback_plan: { command: 'fulcrum memory runtime-experiments rollback runtimeexp_python' },
    })

    const report = buildRuntimeExperimentReport({
      runtime_experiment_id: experiment.runtime_experiment_id,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    })

    expect(report.availability).toMatchObject({
      status: 'failed',
      scope: 'optional_candidate',
      local_baseline_impact: 'none',
      adapter_kind: 'graph_store',
      adapter_name: 'python-ml',
    })
    expect(report.lane.metadata).toMatchObject({
      experiment_type: 'graph_store',
      challenger_contract_status: 'mismatched',
      registered_adapter_kind: 'model_runtime',
    })
    expect(report.lane_contract).toMatchObject({
      contract_version: 'unverified',
      status: 'mismatched',
      disabled_by_default: true,
    })
  })
})
