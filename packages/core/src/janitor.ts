import { getDb } from './db/client.js'
import { escalateRun } from './runs.js'
import { cleanupExpiredLocks } from './locks.js'
import { FulcrumError } from './types.js'
import type { PolicyConfig } from './types.js'
import { JANITOR_INTERVAL_SEC } from './constants.js'

interface JanitorCycleInput {
  workspace_id: string
  policy: PolicyConfig
}

export async function runJanitorCycle(input: JanitorCycleInput): Promise<void> {
  const db = getDb()
  const { heartbeat_timeout_minutes, escalation_timeout_minutes } = input.policy

  if (!Number.isFinite(heartbeat_timeout_minutes) || heartbeat_timeout_minutes < 0) {
    throw new FulcrumError(`Invalid heartbeat_timeout_minutes: ${heartbeat_timeout_minutes}`, 'invalid_input')
  }
  if (!Number.isFinite(escalation_timeout_minutes) || escalation_timeout_minutes < 0) {
    throw new FulcrumError(`Invalid escalation_timeout_minutes: ${escalation_timeout_minutes}`, 'invalid_input')
  }

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
    try {
      await escalateRun({
        run_id,
        escalation_reason: `Auto-escalated by janitor: blocked for more than ${escalation_timeout_minutes} minutes`,
      })
    } catch (err) {
      process.stderr.write(`[janitor] Failed to escalate run ${run_id}: ${String(err)}\n`)
    }
  }

  // Purge expired advisory locks (G-5).
  try {
    await cleanupExpiredLocks()
  } catch (err) {
    process.stderr.write(`[janitor] Failed to cleanup expired locks: ${String(err)}\n`)
  }

  // TTL-reap abandoned worktrees (H-10, spec §18.6).
  // Dynamic import avoids circular dependency: @fulcrum/worktrees depends on @fulcrum/core.
  // If @fulcrum/worktrees is not installed (e.g. core-only consumers), silently skip.
  try {
    const mod = await import('@fulcrum/worktrees').catch(() => null)
    if (mod && typeof mod.cleanupAbandonedWorktrees === 'function') {
      await mod.cleanupAbandonedWorktrees()
    }
  } catch (err) {
    process.stderr.write(`[janitor] Failed to cleanup abandoned worktrees: ${String(err)}\n`)
  }
}

/** Start a background janitor loop. Returns a stop function. */
export function startJanitor(workspace_id: string, policy: PolicyConfig, intervalMs = JANITOR_INTERVAL_SEC * 1000): () => void {
  let running = false
  const timer = setInterval(() => {
    if (running) return // skip if previous cycle hasn't finished
    running = true
    void runJanitorCycle({ workspace_id, policy })
      .catch(console.error)
      .finally(() => { running = false })
  }, intervalMs)
  return () => clearInterval(timer)
}
