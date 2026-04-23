import type { RagHealthStatus } from 'fulcrum-agent-core'
import type { RagHealthReport } from '../rag-health.js'
import type { RagRepairDomainDecision, RagRepairPlanInput, RagRepairVerificationStep } from './contract.js'
import { actionNamesForDomain } from './actions.js'

function doctorCommand(input: RagRepairPlanInput): string {
  return `fulcrum memory doctor --workspace-id ${input.workspace_id} --project-id ${input.project_id} --json`
}

export function buildRepairVerificationSteps(
  input: RagRepairPlanInput,
  decisions: RagRepairDomainDecision[],
): RagRepairVerificationStep[] {
  const actionNamesByDomain = new Map(decisions.map(decision => [decision.domain, actionNamesForDomain(decision.domain)]))
  const command = doctorCommand(input)
  const steps = decisions.map((decision) => ({
    step: `verify_${decision.domain}_health`,
    domain: decision.domain,
    command,
    blocking: true,
    success_states: ['healthy'] as RagHealthStatus[],
    depends_on: decision.depends_on.flatMap(domain => actionNamesByDomain.get(domain) ?? actionNamesForDomain(domain)),
  }))
  steps.push({
    step: 'verify_rag_health',
    command,
    blocking: true,
    success_states: ['healthy'],
    depends_on: decisions.flatMap(decision => actionNamesByDomain.get(decision.domain) ?? actionNamesForDomain(decision.domain)),
  })
  return steps
}

export function evaluateRepairVerification(
  health: RagHealthReport,
  verification_steps: RagRepairVerificationStep[],
): {
  final_health_status: RagHealthStatus
  verified: boolean
  failed_steps: string[]
} {
  const failedSteps = verification_steps
    .filter((step) => {
      if (!step.domain) return !step.success_states.includes(health.status)
      const domainStatus = health.domains[step.domain]?.status ?? 'failed'
      return !step.success_states.includes(domainStatus)
    })
    .map(step => step.step)

  return {
    final_health_status: health.status,
    verified: failedSteps.length === 0,
    failed_steps: failedSteps,
  }
}
