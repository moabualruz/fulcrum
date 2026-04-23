import { getDb, newId } from 'fulcrum-agent-core'
import type { Db, RuntimeExperimentStatus } from 'fulcrum-agent-core'
import type { RoadmapRagEvalLaneIdentity } from '../eval/roadmap/contract.js'
import { redactRagDetails, redactRoadmapArtifact } from '../setup/rag-redaction.js'
import { disabledRuntimeAdapterStatus } from './adapters.js'
import type { RuntimeAdapterAvailability, RuntimeAdapterKind } from './adapters.js'
import {
  RAG_CHALLENGER_CONTRACT_VERSION,
  RAG_CHALLENGER_EVAL_CONTRACT,
  RAG_CHALLENGER_EXPLAIN_CONTRACT,
  getChallengerLaneContract,
} from './challengers/contract.js'
import type { RuntimeComparisonResult } from './comparison.js'

export type RuntimeExperimentType = RuntimeAdapterKind
export type RuntimeAdoptionGateName =
  | 'quality'
  | 'latency'
  | 'rollback'
  | 'local_first'
  | 'agent_tool_parity'
  | 'operational_risk'
export type RuntimeAdoptionGateStatus = 'passed' | 'failed' | 'pending'

export const REQUIRED_RUNTIME_ADOPTION_GATES: RuntimeAdoptionGateName[] = [
  'quality',
  'latency',
  'rollback',
  'local_first',
  'agent_tool_parity',
  'operational_risk',
]

export interface RuntimeAdoptionGate {
  status?: RuntimeAdoptionGateStatus
  reason?: string
  command?: string
  remote_required?: boolean
  missing_tools?: string[]
  risk_level?: 'low' | 'medium' | 'high' | 'critical'
  [key: string]: unknown
}

export type RuntimeAdoptionGates = Partial<Record<RuntimeAdoptionGateName, RuntimeAdoptionGate>>

export interface RuntimeExperiment {
  runtime_experiment_id: string
  workspace_id: string
  project_id: string
  status: RuntimeExperimentStatus
  experiment_type: RuntimeExperimentType
  baseline_eval_run_id: string | null
  candidate_adapter: string
  comparison: Partial<RuntimeComparisonResult> & Record<string, unknown>
  adoption_gates: RuntimeAdoptionGates
  rollback_plan: Record<string, unknown>
  risk_notes: unknown[]
  created_at: string
  updated_at: string
}

export interface CreateRuntimeExperimentInput {
  runtime_experiment_id?: string
  workspace_id: string
  project_id: string
  status?: RuntimeExperimentStatus
  experiment_type: RuntimeExperimentType
  baseline_eval_run_id?: string | null
  candidate_adapter?: string
  comparison?: Partial<RuntimeComparisonResult> & Record<string, unknown>
  adoption_gates?: RuntimeAdoptionGates
  rollback_plan?: Record<string, unknown>
  risk_notes?: unknown[]
}

export interface RuntimeExperimentScope {
  runtime_experiment_id: string
  workspace_id: string
  project_id: string
}

export interface ListRuntimeExperimentsInput {
  workspace_id: string
  project_id: string
  status?: RuntimeExperimentStatus
  limit?: number
}

export interface RuntimeAdoptionGateEvaluation {
  can_adopt: boolean
  required_gates: RuntimeAdoptionGateName[]
  blocking_gates: RuntimeAdoptionGateName[]
  gates: RuntimeAdoptionGates
  reasons: string[]
}

export interface RuntimeExperimentReport extends RuntimeExperiment {
  lane: RoadmapRagEvalLaneIdentity
  lane_contract: {
    contract_version: string
    eval_contract: string
    explain_contract: string
    disabled_by_default: boolean
    planner_stages: string[]
    status: 'registered' | 'mismatched' | 'unregistered'
  }
  availability: RuntimeAdapterAvailability
  adoption: RuntimeAdoptionGateEvaluation
  next_actions: Array<{ label: string; command: string }>
}

interface RuntimeExperimentRow {
  runtime_experiment_id: string
  workspace_id: string
  project_id: string
  status: RuntimeExperimentStatus
  experiment_type: RuntimeExperimentType
  baseline_eval_run_id: string | null
  candidate_adapter: string
  comparison: string
  adoption_gates: string
  rollback_plan: string
  risk_notes: string
  created_at: string
  updated_at: string
}

function sanitizeRuntimeExperimentValue<T>(value: T): T {
  return redactRoadmapArtifact(redactRagDetails(value))
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return sanitizeRuntimeExperimentValue(JSON.parse(value) as T)
  } catch {
    return fallback
  }
}

function parseRuntimeExperimentRow(row: RuntimeExperimentRow): RuntimeExperiment {
  return sanitizeRuntimeExperimentValue({
    runtime_experiment_id: row.runtime_experiment_id,
    workspace_id: row.workspace_id,
    project_id: row.project_id,
    status: row.status,
    experiment_type: row.experiment_type,
    baseline_eval_run_id: row.baseline_eval_run_id,
    candidate_adapter: row.candidate_adapter,
    comparison: parseJson(row.comparison, {}),
    adoption_gates: parseJson(row.adoption_gates, {}),
    rollback_plan: parseJson(row.rollback_plan, {}),
    risk_notes: parseJson(row.risk_notes, []),
    created_at: row.created_at,
    updated_at: row.updated_at,
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasEntries(value: Record<string, unknown>): boolean {
  return Object.keys(value).length > 0
}

function mergedAdoptionGates(experiment: RuntimeExperiment): RuntimeAdoptionGates {
  const comparisonGates = isPlainObject(experiment.comparison['gates'])
    ? experiment.comparison['gates'] as unknown as Record<string, RuntimeAdoptionGate>
    : {}
  return {
    quality: experiment.adoption_gates.quality ?? comparisonGates['quality'],
    latency: experiment.adoption_gates.latency ?? comparisonGates['latency'],
    rollback: experiment.adoption_gates.rollback,
    local_first: experiment.adoption_gates.local_first,
    agent_tool_parity: experiment.adoption_gates.agent_tool_parity,
    operational_risk: experiment.adoption_gates.operational_risk,
  }
}

function gateFailureReason(name: RuntimeAdoptionGateName, gate: RuntimeAdoptionGate | undefined, experiment: RuntimeExperiment): string | null {
  if (!gate || gate.status !== 'passed') return `${name} gate is not passed`
  if (name === 'rollback' && !gate.command && !hasEntries(experiment.rollback_plan)) return 'rollback gate needs a persisted rollback plan or command'
  if (name === 'local_first' && gate.remote_required !== false) return 'local-first gate must explicitly prove remote_required=false'
  if (name === 'agent_tool_parity') {
    const missingTools = gate.missing_tools
    if (!Array.isArray(missingTools)) return 'agent/tool parity gate must explicitly list missing tools'
    if (missingTools.length > 0) return 'agent/tool parity gate has missing tools'
  }
  if (name === 'operational_risk' && (gate.risk_level !== 'low' && gate.risk_level !== 'medium')) return 'operational risk gate needs explicit low or medium risk'
  return null
}

export function createRuntimeExperiment(input: CreateRuntimeExperimentInput, db: Db = getDb()): RuntimeExperiment {
  const runtime_experiment_id = input.runtime_experiment_id ?? newId('runtime_experiment')
  db.prepare(`
    INSERT INTO runtime_experiments (
      runtime_experiment_id, workspace_id, project_id, status, experiment_type,
      baseline_eval_run_id, candidate_adapter, comparison, adoption_gates,
      rollback_plan, risk_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    runtime_experiment_id,
    input.workspace_id,
    input.project_id,
    input.status ?? 'disabled',
    input.experiment_type,
    input.baseline_eval_run_id ?? null,
    sanitizeRuntimeExperimentValue(input.candidate_adapter ?? ''),
    JSON.stringify(sanitizeRuntimeExperimentValue(input.comparison ?? {})),
    JSON.stringify(sanitizeRuntimeExperimentValue(input.adoption_gates ?? {})),
    JSON.stringify(sanitizeRuntimeExperimentValue(input.rollback_plan ?? {})),
    JSON.stringify(sanitizeRuntimeExperimentValue(input.risk_notes ?? [])),
  )
  const created = getRuntimeExperiment({ runtime_experiment_id, workspace_id: input.workspace_id, project_id: input.project_id }, db)
  if (!created) throw new Error(`runtime experiment not found after create: ${runtime_experiment_id}`)
  return created
}

export function getRuntimeExperiment(input: RuntimeExperimentScope, db: Db = getDb()): RuntimeExperiment | null {
  const row = db.prepare(`
    SELECT *
      FROM runtime_experiments
     WHERE runtime_experiment_id = ?
       AND workspace_id = ?
       AND project_id = ?
  `).get(input.runtime_experiment_id, input.workspace_id, input.project_id) as RuntimeExperimentRow | undefined
  return row ? parseRuntimeExperimentRow(row) : null
}

export function requireRuntimeExperiment(input: RuntimeExperimentScope, db: Db = getDb()): RuntimeExperiment {
  const experiment = getRuntimeExperiment(input, db)
  if (!experiment) throw new Error(`runtime experiment not found in workspace/project scope: ${input.runtime_experiment_id}`)
  return experiment
}

export function listRuntimeExperiments(input: ListRuntimeExperimentsInput, db: Db = getDb()): RuntimeExperiment[] {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 500))
  const rows = input.status
    ? db.prepare(`
        SELECT *
          FROM runtime_experiments
         WHERE workspace_id = ?
           AND project_id = ?
           AND status = ?
         ORDER BY updated_at DESC, runtime_experiment_id DESC
         LIMIT ?
      `).all(input.workspace_id, input.project_id, input.status, limit)
    : db.prepare(`
        SELECT *
          FROM runtime_experiments
         WHERE workspace_id = ?
           AND project_id = ?
         ORDER BY updated_at DESC, runtime_experiment_id DESC
         LIMIT ?
      `).all(input.workspace_id, input.project_id, limit)
  return (rows as RuntimeExperimentRow[]).map(parseRuntimeExperimentRow)
}

export function transitionRuntimeExperimentStatus(
  input: RuntimeExperimentScope & { status: RuntimeExperimentStatus },
  db: Db = getDb(),
): RuntimeExperiment {
  const result = db.prepare(`
    UPDATE runtime_experiments
       SET status = ?, updated_at = datetime('now')
     WHERE runtime_experiment_id = ?
       AND workspace_id = ?
       AND project_id = ?
  `).run(input.status, input.runtime_experiment_id, input.workspace_id, input.project_id)
  if (result.changes === 0) throw new Error(`runtime experiment not found in workspace/project scope: ${input.runtime_experiment_id}`)
  return requireRuntimeExperiment(input, db)
}

export function updateRuntimeExperimentComparison(
  input: RuntimeExperimentScope & {
    comparison: Partial<RuntimeComparisonResult> & Record<string, unknown>
    adoption_gates?: RuntimeAdoptionGates
    status?: RuntimeExperimentStatus
  },
  db: Db = getDb(),
): RuntimeExperiment {
  const current = requireRuntimeExperiment(input, db)
  const nextGates = input.adoption_gates ?? current.adoption_gates
  const result = db.prepare(`
    UPDATE runtime_experiments
       SET comparison = ?, adoption_gates = ?, status = COALESCE(?, status), updated_at = datetime('now')
     WHERE runtime_experiment_id = ?
       AND workspace_id = ?
       AND project_id = ?
  `).run(
    JSON.stringify(sanitizeRuntimeExperimentValue(input.comparison)),
    JSON.stringify(sanitizeRuntimeExperimentValue(nextGates)),
    input.status ?? null,
    input.runtime_experiment_id,
    input.workspace_id,
    input.project_id,
  )
  if (result.changes === 0) throw new Error(`runtime experiment not found in workspace/project scope: ${input.runtime_experiment_id}`)
  return requireRuntimeExperiment(input, db)
}

export function evaluateRuntimeAdoptionGates(experiment: RuntimeExperiment): RuntimeAdoptionGateEvaluation {
  const gates = sanitizeRuntimeExperimentValue(mergedAdoptionGates(experiment))
  const blocking_gates: RuntimeAdoptionGateName[] = []
  const reasons: string[] = []
  for (const name of REQUIRED_RUNTIME_ADOPTION_GATES) {
    const reason = gateFailureReason(name, gates[name], experiment)
    if (reason) {
      blocking_gates.push(name)
      reasons.push(reason)
    }
  }
  return sanitizeRuntimeExperimentValue({
    can_adopt: blocking_gates.length === 0,
    required_gates: REQUIRED_RUNTIME_ADOPTION_GATES,
    blocking_gates,
    gates,
    reasons,
  })
}

export function adoptRuntimeExperiment(input: RuntimeExperimentScope, db: Db = getDb()): RuntimeExperiment {
  const experiment = requireRuntimeExperiment(input, db)
  const evaluation = evaluateRuntimeAdoptionGates(experiment)
  if (!evaluation.can_adopt) {
    transitionRuntimeExperimentStatus({ ...input, status: 'rejected' }, db)
    throw new Error(`cannot adopt runtime experiment; blocking gates: ${evaluation.blocking_gates.join(', ')}`)
  }
  return transitionRuntimeExperimentStatus({ ...input, status: 'adopted' }, db)
}

export function rollbackRuntimeExperiment(input: RuntimeExperimentScope, db: Db = getDb()): RuntimeExperiment {
  return transitionRuntimeExperimentStatus({ ...input, status: 'rolled_back' }, db)
}

function resolveRegisteredChallenger(experiment: RuntimeExperiment) {
  const challenger = getChallengerLaneContract(experiment.candidate_adapter)
  if (!challenger) {
    return { challenger: null, status: 'unregistered' as const }
  }
  if (challenger.adapter.adapter_kind !== experiment.experiment_type) {
    return { challenger, status: 'mismatched' as const }
  }
  return { challenger, status: 'registered' as const }
}

function availabilityForExperiment(experiment: RuntimeExperiment): RuntimeAdapterAvailability {
  const resolved = resolveRegisteredChallenger(experiment)
  const challenger = resolved.challenger
  if (experiment.status === 'disabled') {
    return challenger && resolved.status === 'registered'
      ? sanitizeRuntimeExperimentValue({
        status: 'disabled',
        scope: 'out_of_scope',
        local_baseline_impact: 'none',
        adapter_kind: challenger.adapter.adapter_kind,
        adapter_name: challenger.adapter.adapter_name,
        reason: 'optional runtime experiment disabled by default',
        details: {
          experiment_type: experiment.experiment_type,
          baseline_eval_run_id: experiment.baseline_eval_run_id,
          lane_id: challenger.lane.lane_id,
        },
      })
      : challenger && resolved.status === 'mismatched'
        ? sanitizeRuntimeExperimentValue({
          status: 'failed',
          scope: 'optional_candidate',
          local_baseline_impact: 'none',
          adapter_kind: experiment.experiment_type,
          adapter_name: experiment.candidate_adapter || 'candidate',
          reason: 'candidate adapter does not match persisted experiment type',
          details: {
            experiment_type: experiment.experiment_type,
            registered_adapter_kind: challenger.adapter.adapter_kind,
            baseline_eval_run_id: experiment.baseline_eval_run_id,
          },
        })
      : disabledRuntimeAdapterStatus({
      adapter_kind: experiment.experiment_type,
      adapter_name: experiment.candidate_adapter || 'unconfigured',
      reason: 'optional runtime experiment disabled by default',
      details: {
        experiment_type: experiment.experiment_type,
        baseline_eval_run_id: experiment.baseline_eval_run_id,
      },
    })
  }
  if (challenger && resolved.status === 'registered') {
    return sanitizeRuntimeExperimentValue({
      status: 'available',
      scope: 'optional_candidate',
      local_baseline_impact: 'none',
      adapter_kind: challenger.adapter.adapter_kind,
      adapter_name: challenger.adapter.adapter_name,
      reason: 'challenger lane is available for comparison; baseline remains source of truth until adoption gates pass',
      details: {
        lane_id: challenger.lane.lane_id,
        contract_version: challenger.contract_version,
      },
    })
  }
  if (challenger && resolved.status === 'mismatched') {
    return sanitizeRuntimeExperimentValue({
      status: 'failed',
      scope: 'optional_candidate',
      local_baseline_impact: 'none',
      adapter_kind: experiment.experiment_type,
      adapter_name: experiment.candidate_adapter || 'candidate',
      reason: 'candidate adapter does not match persisted experiment type',
      details: {
        experiment_type: experiment.experiment_type,
        registered_adapter_kind: challenger.adapter.adapter_kind,
      },
    })
  }
  return sanitizeRuntimeExperimentValue({
    status: 'available',
    scope: 'optional_candidate',
    local_baseline_impact: 'none',
    adapter_kind: experiment.experiment_type,
    adapter_name: experiment.candidate_adapter || 'candidate',
    reason: 'candidate runtime experiment is recorded; local baseline remains source of truth until adoption gates pass',
  })
}

function nextActionsForReport(experiment: RuntimeExperiment, evaluation: RuntimeAdoptionGateEvaluation): Array<{ label: string; command: string }> {
  if (experiment.status === 'disabled') {
    return [{
      label: 'List runtime experiments',
      command: 'fulcrum memory runtime-experiments list --json',
    }]
  }
  if (!evaluation.can_adopt) {
    return [{
      label: 'Review blocking gates',
      command: `fulcrum memory runtime-experiments report ${experiment.runtime_experiment_id} --json`,
    }]
  }
  if (experiment.status !== 'adopted') {
    return [{
      label: 'Adopt candidate runtime',
      command: `fulcrum memory runtime-experiments adopt ${experiment.runtime_experiment_id} --json`,
    }]
  }
  return [{
    label: 'Rollback adopted runtime',
    command: `fulcrum memory runtime-experiments rollback ${experiment.runtime_experiment_id} --json`,
  }]
}

function laneForExperiment(experiment: RuntimeExperiment): RoadmapRagEvalLaneIdentity {
  const resolved = resolveRegisteredChallenger(experiment)
  const challenger = resolved.challenger
  if (challenger && resolved.status === 'registered') return sanitizeRuntimeExperimentValue(challenger.lane)
  return sanitizeRuntimeExperimentValue({
    lane_id: experiment.candidate_adapter.trim() || `${experiment.experiment_type}-candidate`,
    lane_label: resolved.status === 'mismatched'
      ? `${experiment.candidate_adapter.trim() || 'Unnamed challenger'} (unverified)`
      : experiment.candidate_adapter.trim() || 'Unnamed challenger',
    lane_type: 'challenger',
    runtime: 'optional',
    adapter: experiment.candidate_adapter.trim() || undefined,
    metadata: {
      experiment_type: experiment.experiment_type,
      challenger_contract_status: resolved.status,
      registered_adapter_kind: challenger?.adapter.adapter_kind,
    },
  })
}

function laneContractForExperiment(experiment: RuntimeExperiment): RuntimeExperimentReport['lane_contract'] {
  const resolved = resolveRegisteredChallenger(experiment)
  const challenger = resolved.challenger
  if (challenger && resolved.status === 'registered') {
    return sanitizeRuntimeExperimentValue({
      contract_version: challenger.contract_version,
      eval_contract: challenger.eval_contract,
      explain_contract: challenger.explain_contract,
      disabled_by_default: challenger.disabled_by_default,
      planner_stages: challenger.planner_stages,
      status: 'registered',
    })
  }
  return sanitizeRuntimeExperimentValue({
    contract_version: resolved.status === 'mismatched' ? 'unverified' : 'unregistered',
    eval_contract: resolved.status === 'mismatched' ? RAG_CHALLENGER_EVAL_CONTRACT : 'unregistered',
    explain_contract: resolved.status === 'mismatched' ? RAG_CHALLENGER_EXPLAIN_CONTRACT : 'unregistered',
    disabled_by_default: true,
    planner_stages: ['candidate_generation', 'runtime_truth', 'explain'],
    status: resolved.status,
  })
}

export function buildRuntimeExperimentReport(input: RuntimeExperimentScope, db: Db = getDb()): RuntimeExperimentReport {
  const experiment = requireRuntimeExperiment(input, db)
  const adoption = evaluateRuntimeAdoptionGates(experiment)
  return sanitizeRuntimeExperimentValue({
    ...experiment,
    lane: laneForExperiment(experiment),
    lane_contract: laneContractForExperiment(experiment),
    availability: availabilityForExperiment(experiment),
    adoption,
    next_actions: nextActionsForReport(experiment, adoption),
  })
}
