import { getDb } from './db/client.js'
import { FulcrumError } from './types.js'
import type { AgentRole, PolicyConfig, PolicyCheckResult } from './types.js'

interface CheckPolicyInput {
  workspace_id: string
  task_id: string
  role: AgentRole
  policy: PolicyConfig
}

export async function checkPolicy(input: CheckPolicyInput, db = getDb()): Promise<PolicyCheckResult> {
  if (!Number.isFinite(input.policy.wip_limit) || input.policy.wip_limit < 0) {
    throw new FulcrumError(`Invalid wip_limit: ${input.policy.wip_limit}`, 'invalid_input')
  }
  for (const [role, limit] of Object.entries(input.policy.wip_limit_per_role)) {
    if (limit !== undefined && (!Number.isFinite(limit) || limit < 0)) {
      throw new FulcrumError(`Invalid wip_limit_per_role[${role}]: ${limit}`, 'invalid_input')
    }
  }

  // Check dependency completion — use task_relations (single source of truth)
  const taskExists = db.prepare('SELECT task_id FROM tasks WHERE task_id = ? AND workspace_id = ?')
    .get(input.task_id, input.workspace_id) as { task_id: string } | undefined
  if (!taskExists) throw new FulcrumError(`Task ${input.task_id} not found`, 'not_found')

  // Find all tasks that this task depends on (follows/blocked_by/preceded_by relations)
  const depRows = db.prepare(
    `SELECT target_task_id FROM task_relations WHERE task_id = ? AND relation_type IN ('follows','blocked_by','preceded_by')`
  ).all(input.task_id) as { target_task_id: string }[]
  const deps = depRows.map(r => r.target_task_id)
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
