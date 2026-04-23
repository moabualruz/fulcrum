import { getDb } from 'fulcrum-agent-core'
import type { Db, RagHealthStatus } from 'fulcrum-agent-core'
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
  input?: { workspace_id: string; project_id: string; verification_refs?: string[]; domains?: string[] },
  db: Db = getDb(),
): {
  final_health_status: RagHealthStatus
  verified: boolean
  failed_steps: string[]
  eval_gate_refs: string[]
  failed_eval_refs: string[]
} {
  const requestedDomains = input?.domains ?? []
  const failedSteps = verification_steps
    .filter((step) => {
      if (!step.domain) {
        if (requestedDomains.length === 0) return !step.success_states.includes(health.status)
        return requestedDomains.some((domain) => {
          const domainStatus = health.domains[domain]?.status ?? 'failed'
          return !step.success_states.includes(domainStatus)
        })
      }
      const domainStatus = health.domains[step.domain]?.status ?? 'failed'
      return !step.success_states.includes(domainStatus)
    })
    .map(step => step.step)
  const verificationRefs = input?.verification_refs ?? []
  const failedEvalRefs = verificationRefs.filter((eval_run_id) => {
    const row = db.prepare(`
      SELECT status
        FROM rag_eval_runs
       WHERE eval_run_id = ?
         AND workspace_id = ?
         AND project_id = ?
    `).get(eval_run_id, input?.workspace_id, input?.project_id) as { status?: string } | undefined
    return row !== undefined && row.status !== 'passed'
  })

  return {
    final_health_status: health.status,
    verified: failedSteps.length === 0 && failedEvalRefs.length === 0,
    failed_steps: failedSteps,
    eval_gate_refs: verificationRefs,
    failed_eval_refs: failedEvalRefs,
  }
}
