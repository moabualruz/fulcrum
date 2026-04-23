import { getDb, newId } from 'fulcrum-agent-core'
import type { Db, RagHealthStatus, RuntimeDataProfile } from 'fulcrum-agent-core'
import { buildRagHealthReport } from './rag-health.js'
import { buildRepairActions } from './repair/actions.js'
import type { RagRepairPlan, RagRepairPlanInput } from './repair/contract.js'
import { buildRepairDependencyGraph } from './repair/dependency-graph.js'
import { buildRepairVerificationSteps } from './repair/verification.js'

export function createEmptyRagRepairPlan(input: RagRepairPlanInput): RagRepairPlan {
  return {
    repair_plan_id: '',
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    runtime_profile: input.runtime_profile ?? 'dev',
    status: 'planned',
    health_status: 'healthy',
    strategy: 'targeted_repair',
    next_action: 'none',
    clean_slate_required: false,
    domains: [],
    targeted_domains: [],
    clean_slate_domains: [],
    execution_order: [],
    domain_details: {},
    mutation_scope: {
      derived_state_only: true,
      domains: [],
      canonical_sources_mutated: false,
    },
    required_actions: [],
    optional_actions: [],
    verification_steps: [],
    blocking_conditions: [],
    blocking_errors: [],
    repair_reasoning: [],
    preflight_warnings: [],
  }
}

export function buildRagRepairPlan(input: RagRepairPlanInput, db: Db = getDb()): RagRepairPlan {
  const runtime_profile = input.runtime_profile ?? 'dev'
  const requestedDomains = input.domains ? new Set(input.domains) : null
  const health = buildRagHealthReport({
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    runtime_profile,
    data_dir: input.data_dir,
  }, db)
  const domains = Object.entries(health.domains)
    .filter(([, domain]) => {
      const status = domain.status as RagHealthStatus
      return status !== 'healthy' && status !== 'out_of_scope'
    })
    .filter(([domain]) => requestedDomains === null || domain === 'l0' || domain === 'l1' || requestedDomains.has(domain))
    .map(([domain]) => domain)
  const domain_details = Object.fromEntries(domains.map(domain => [domain, health.domains[domain]]))
  const graph = buildRepairDependencyGraph({ ...input, runtime_profile }, health)
  const actions = buildRepairActions({ ...input, runtime_profile }, runtime_profile, graph.decisions, domain_details)
  const verification_steps = buildRepairVerificationSteps({ ...input, runtime_profile }, graph.decisions)
  const blocking_errors = graph.blocking_conditions.map(condition => condition.reason)

  return {
    repair_plan_id: newId('rag_repair_plan'),
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    runtime_profile,
    status: 'planned',
    health_status: health.status,
    strategy: graph.strategy,
    next_action: graph.strategy === 'blocked'
      ? 'review_blockers'
      : graph.clean_slate_domains.length > 0
        ? 'clean_slate_rebuild'
        : graph.targeted_domains.length > 0
          ? 'targeted_repair'
          : 'none',
    clean_slate_required: graph.clean_slate_domains.length > 0,
    domains,
    targeted_domains: graph.targeted_domains,
    clean_slate_domains: graph.clean_slate_domains,
    execution_order: graph.execution_order,
    domain_details,
    mutation_scope: {
      derived_state_only: true,
      domains,
      canonical_sources_mutated: false,
    },
    required_actions: actions.required_actions,
    optional_actions: actions.optional_actions,
    verification_steps,
    blocking_conditions: graph.blocking_conditions,
    blocking_errors,
    repair_reasoning: graph.repair_reasoning,
    preflight_warnings: health.warnings,
  }
}
