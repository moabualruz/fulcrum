import { getDb } from './db/client.js'
import { escalateRun } from './runs.js'
import type { PolicyConfig } from './types.js'

interface JanitorCycleInput {
  workspace_id: string
  policy: PolicyConfig
}

export async function runJanitorCycle(input: JanitorCycleInput): Promise<void> {
  const db = getDb()
  const { heartbeat_timeout_minutes, escalation_timeout_minutes } = input.policy

  // Mark running runs stale when no heartbeat received within timeout
  db.prepare(`
    UPDATE agent_runs
    SET status = 'stale', updated_at = datetime('now')
    WHERE workspace_id = ?
      AND status = 'running'
      AND updated_at <= datetime('now', ? || ' minutes')
  `).run(input.workspace_id, `-${heartbeat_timeout_minutes}`)

  // Auto-escalate blocked runs past escalation timeout
  const overdueBlocked = db.prepare(`
    SELECT run_id FROM agent_runs
    WHERE workspace_id = ?
      AND status = 'blocked'
      AND updated_at <= datetime('now', ? || ' minutes')
  `).all(input.workspace_id, `-${escalation_timeout_minutes}`) as { run_id: string }[]

  for (const { run_id } of overdueBlocked) {
    await escalateRun({
      run_id,
      escalation_reason: `Auto-escalated by janitor: blocked for more than ${escalation_timeout_minutes} minutes`,
    })
  }
}

/** Start a background janitor loop. Returns a stop function. */
export function startJanitor(workspace_id: string, policy: PolicyConfig, intervalMs = 60_000): () => void {
  const timer = setInterval(() => {
    void runJanitorCycle({ workspace_id, policy }).catch(console.error)
  }, intervalMs)
  return () => clearInterval(timer)
}
