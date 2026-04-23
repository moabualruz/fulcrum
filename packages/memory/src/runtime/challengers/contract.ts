import type { RoadmapRagEvalLaneIdentity } from '../../eval/roadmap/contract.js'
import {
  disabledRuntimeAdapterStatus,
  sanitizeRuntimeAdapterDescriptor,
  type RuntimeAdapterAvailability,
  type RuntimeAdapterKind,
} from '../adapters.js'

export const RAG_CHALLENGER_CONTRACT_VERSION = 'rag-challenger-v1'
export const RAG_CHALLENGER_EVAL_CONTRACT = 'roadmap-rag-eval-v1'
export const RAG_CHALLENGER_EXPLAIN_CONTRACT = 'shared-rag-explain-v1'

export type ChallengerLaneId = 'python-ml' | 'rust-search'
export type ChallengerPlannerStage =
  | 'intent'
  | 'candidate_generation'
  | 'fusion'
  | 'rerank'
  | 'runtime_truth'
  | 'explain'

export interface ChallengerAvailabilityInput {
  lane_id: ChallengerLaneId
  adapter_name?: string
  reason?: string
  details?: Record<string, unknown>
}

export interface RagChallengerLaneAdapterRef {
  adapter_kind: RuntimeAdapterKind
  adapter_name: ChallengerLaneId
}

export interface RagChallengerLaneContract {
  contract_version: typeof RAG_CHALLENGER_CONTRACT_VERSION
  eval_contract: typeof RAG_CHALLENGER_EVAL_CONTRACT
  explain_contract: typeof RAG_CHALLENGER_EXPLAIN_CONTRACT
  disabled_by_default: true
  lane: RoadmapRagEvalLaneIdentity
  adapter: RagChallengerLaneAdapterRef
  planner_stages: ChallengerPlannerStage[]
  availability: () => RuntimeAdapterAvailability | Promise<RuntimeAdapterAvailability>
}

function makeContract(definition: {
  lane_id: ChallengerLaneId
  lane_label: string
  runtime: string
  adapter_kind: RuntimeAdapterKind
  planner_stages: ChallengerPlannerStage[]
}): RagChallengerLaneContract {
  return {
    contract_version: RAG_CHALLENGER_CONTRACT_VERSION,
    eval_contract: RAG_CHALLENGER_EVAL_CONTRACT,
    explain_contract: RAG_CHALLENGER_EXPLAIN_CONTRACT,
    disabled_by_default: true,
    lane: {
      lane_id: definition.lane_id,
      lane_label: definition.lane_label,
      lane_type: 'challenger',
      runtime: definition.runtime,
      adapter: definition.lane_id,
      metadata: {
        adapter_kind: definition.adapter_kind,
        disabled_by_default: true,
      },
    },
    adapter: {
      adapter_kind: definition.adapter_kind,
      adapter_name: definition.lane_id,
    },
    planner_stages: definition.planner_stages,
    availability: () => buildChallengerAvailability({ lane_id: definition.lane_id }),
  }
}

const CHALLENGER_CONTRACTS: Record<ChallengerLaneId, RagChallengerLaneContract> = {
  'python-ml': makeContract({
    lane_id: 'python-ml',
    lane_label: 'Python ML challenger',
    runtime: 'python',
    adapter_kind: 'model_runtime',
    planner_stages: ['intent', 'candidate_generation', 'rerank', 'runtime_truth', 'explain'],
  }),
  'rust-search': makeContract({
    lane_id: 'rust-search',
    lane_label: 'Rust search challenger',
    runtime: 'rust',
    adapter_kind: 'code_indexer',
    planner_stages: ['intent', 'candidate_generation', 'fusion', 'runtime_truth', 'explain'],
  }),
}

export async function buildChallengerAvailability(input: ChallengerAvailabilityInput): Promise<RuntimeAdapterAvailability> {
  const contract = CHALLENGER_CONTRACTS[input.lane_id]
  return sanitizeRuntimeAdapterDescriptor(disabledRuntimeAdapterStatus({
    adapter_kind: contract.adapter.adapter_kind,
    adapter_name: contract.adapter.adapter_name,
    reason: input.reason ?? `${contract.lane.lane_label} is disabled by default until trust gates pass`,
    details: {
      lane_id: contract.lane.lane_id,
      requested_adapter_name: input.adapter_name,
      ...(input.details ?? {}),
    },
  }))
}

export function getChallengerLaneContract(name: string | null | undefined): RagChallengerLaneContract | null {
  if (!name) return null
  return CHALLENGER_CONTRACTS[name as ChallengerLaneId] ?? null
}

export function listChallengerLaneContracts(): RagChallengerLaneContract[] {
  return Object.values(CHALLENGER_CONTRACTS).map(contract => sanitizeRuntimeAdapterDescriptor(contract))
}
