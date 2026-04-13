import { getDb } from './db/client.js'
import { FulcrumError } from './types.js'
import type { AgentRole, PolicyConfig, PolicyCheckResult } from './types.js'

interface CheckPolicyInput {
  workspace_id: string
  task_id: string
  role: AgentRole
  policy: PolicyConfig
}

export async function checkPolicy(input: CheckPolicyInput): Promise<PolicyCheckResult> {
  if (!Number.isFinite(input.policy.wip_limit) || input.policy.wip_limit < 0) {
    throw new FulcrumError(`Invalid wip_limit: ${input.policy.wip_limit}`, 'invalid_input')
  }
  for (const [role, limit] of Object.entries(input.policy.wip_limit_per_role)) {
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 0)) {
      throw new FulcrumError(`Invalid wip_limit_per_role[${role}]: ${limit}`, 'invalid_input')
    }
  }
  const db = getDb()

  // Check dependency completion — scope by workspace to prevent cross-workspace leakage
  const taskRow = db.prepare('SELECT depends_on FROM tasks WHERE task_id = ? AND workspace_id = ?')
    .get(input.task_id, input.workspace_id) as { depends_on: string } | undefined
  if (!taskRow) throw new FulcrumError(`Task ${input.task_id} not found`, 'not_found')

  let deps: string[] = []
  try { deps = JSON.parse(taskRow.depends_on) as string[] } catch { deps = [] }
  if (deps.length > 0) {
    const placeholders = deps.map(() => '?').join(',')
    const incomplete = db.prepare(
      `SELECT task_id FROM tasks WHERE task_id IN (${placeholders}) AND status != 'completed'`
    ).all(...deps) as { task_id: string }[]
    if (incomplete.length > 0) {
      return {
        allowed: false,
        reason: 'dependencies_incomplete',
        blocking_tasks: incomplete.map(r => r.task_id),
      }
    }
  }

  // Check per-role WIP limit
  const roleLimit = input.policy.wip_limit_per_role[input.role]
  if (roleLimit !== undefined) {
    const roleCount = (db.prepare(
      "SELECT COUNT(*) as c FROM agent_runs WHERE workspace_id = ? AND role = ? AND status = 'running'"
    ).get(input.workspace_id, input.role) as { c: number }).c
    if (roleCount >= roleLimit) {
      return { allowed: false, reason: 'wip_limit_exceeded', current_wip: roleCount, limit: roleLimit }
    }
  }

  // Check global WIP limit
  const globalCount = (db.prepare(
    "SELECT COUNT(*) as c FROM agent_runs WHERE workspace_id = ? AND status = 'running'"
  ).get(input.workspace_id) as { c: number }).c
  if (globalCount >= input.policy.wip_limit) {
    return { allowed: false, reason: 'wip_limit_exceeded', current_wip: globalCount, limit: input.policy.wip_limit }
  }

  return { allowed: true }
}
