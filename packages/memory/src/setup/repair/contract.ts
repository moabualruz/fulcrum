import type { RagHealthStatus, RuntimeDataProfile } from 'fulcrum-agent-core'

export type RagRepairStrategy = 'targeted_repair' | 'clean_slate_rebuild' | 'blocked'
export type RagRepairPhase = 'repair' | 'verify'

export interface RagRepairAction {
  action: string
  command: string
  mutating: boolean
  estimated_items: number
  retryable: boolean
  domain?: string
  phase?: RagRepairPhase
  depends_on?: string[]
  clean_slate?: boolean
  reason?: string
}

export interface RagRepairBlockingCondition {
  code: string
  domain: string
  reason: string
  retryable: boolean
}

export interface RagRepairVerificationStep {
  step: string
  domain?: string
  command: string
  blocking: boolean
  success_states: RagHealthStatus[]
  depends_on?: string[]
}

export interface RagRepairPlan {
  repair_plan_id: string
  workspace_id: string
  project_id: string
  runtime_profile: RuntimeDataProfile
  status: 'planned'
  health_status: RagHealthStatus
  strategy: RagRepairStrategy
  next_action: 'targeted_repair' | 'clean_slate_rebuild' | 'review_blockers' | 'none'
  clean_slate_required: boolean
  domains: string[]
  targeted_domains: string[]
  clean_slate_domains: string[]
  execution_order: string[]
  domain_details: Record<string, unknown>
  mutation_scope: {
    derived_state_only: boolean
    domains: string[]
    canonical_sources_mutated: boolean
  }
  required_actions: RagRepairAction[]
  optional_actions: RagRepairAction[]
  verification_steps: RagRepairVerificationStep[]
  blocking_conditions: RagRepairBlockingCondition[]
  blocking_errors: string[]
  repair_reasoning: string[]
  preflight_warnings: string[]
}

export interface RagRepairPlanInput {
  workspace_id: string
  project_id: string
  runtime_profile?: RuntimeDataProfile
  data_dir?: string
  domains?: string[]
}

export interface RagRepairDomainDecision {
  domain: string
  mode: 'targeted_repair' | 'clean_slate_rebuild' | 'blocked'
  depends_on: string[]
  reason: string
}
