import { getDb } from './db/client.js'
import type { AgentRole, PolicyConfig, PolicyCheckResult } from './types.js'

interface CheckPolicyInput {
  workspace_id: string
  task_id: string
  role: AgentRole
  policy: PolicyConfig
}

export async function checkPolicy(input: CheckPolicyInput): Promise<PolicyCheckResult> {
  const db = getDb()

  // Check dependency completion
  const taskRow = db.prepare('SELECT depends_on FROM tasks WHERE task_id = ?')
    .get(input.task_id) as { depends_on: string } | undefined
  if (taskRow) {
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
