import { getDb } from './db/client.js'
import { escalateRun } from './runs.js'
import { cleanupExpiredLocks } from './locks.js'
import { FulcrumError } from './types.js'
import type { PolicyConfig } from './types.js'
import {
  JANITOR_INTERVAL_SEC,
  MEMORY_DECAY_FACTOR,
  MEMORY_DECAY_THRESHOLD,
  MEMORY_DECAY_MIN_DAYS_SINCE_ACCESS,
  MEMORY_DECAY_FLOOR,
} from './constants.js'
import { startSpan, endSpan } from './telemetry/spans.js'

/**
 * Apply importance decay to low-importance memories that haven't been accessed
 * recently. Factor: MEMORY_DECAY_FACTOR per week elapsed since last_accessed_at.
 * Only touches memories with importance < MEMORY_DECAY_THRESHOLD that haven't
 * been accessed in at least MEMORY_DECAY_MIN_DAYS_SINCE_ACCESS days.
 *
 * Returns the count of memories updated.
 */
export function decayMemories(workspace_id?: string): number {
  const db = getDb()

  // Fetch candidates: low-importance memories not accessed recently
  const whereParts = [
    'importance < ?',
    "last_accessed_at <= datetime('now', ? || ' days')",
  ]
  const params: unknown[] = [
    MEMORY_DECAY_THRESHOLD,
    `-${MEMORY_DECAY_MIN_DAYS_SINCE_ACCESS}`,
  ]
  if (workspace_id) {
    whereParts.push('workspace_id = ?')
    params.push(workspace_id)
  }

  const candidates = db.prepare(
    `SELECT memory_id, importance, last_accessed_at FROM memories WHERE ${whereParts.join(' AND ')}`
  ).all(...params) as { memory_id: string; importance: number; last_accessed_at: string }[]

  if (candidates.length === 0) return 0

  const now = Date.now()
  let updated = 0
  const stmt = db.prepare('UPDATE memories SET importance = ?, updated_at = datetime(\'now\') WHERE memory_id = ?')

  for (const row of candidates) {
    const accessedMs = new Date(row.last_accessed_at).getTime()
    const weeksElapsed = Math.max(0, (now - accessedMs) / (1000 * 60 * 60 * 24 * 7))
    const decayed = row.importance * Math.pow(MEMORY_DECAY_FACTOR, weeksElapsed)
    const newImportance = Math.max(MEMORY_DECAY_FLOOR, decayed)

    if (newImportance < row.importance - 0.001) {
      stmt.run(newImportance, row.memory_id)
      updated++
    }
  }

  return updated
}

interface JanitorCycleInput {
  workspace_id: string
  policy: PolicyConfig
  /** Run memory importance decay (default true). */
  runDecay?: boolean
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

  // Telemetry: one span per cycle. Records counts of everything cleaned.
  const span = await startSpan({
    name: 'janitor.cycle',
    workspace_id: input.workspace_id,
    payload: { triggered_by: 'interval' },
  })

  let staleRuns = 0
  let escalatedRuns = 0
  let cleanedLocks = 0
  let cleanedWorktrees = 0
  let decayedMemories = 0

  try {
    // Mark running runs stale when no heartbeat received within timeout
    const staleResult = db.prepare(`
      UPDATE agent_runs
      SET status = 'stale', updated_at = datetime('now')
      WHERE workspace_id = ?
        AND status = 'running'
        AND updated_at <= datetime('now', ? || ' minutes')
    `).run(input.workspace_id, `-${heartbeat_timeout_minutes}`)
    staleRuns = staleResult.changes ?? 0

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
        escalatedRuns += 1
      } catch (err) {
        process.stderr.write(`[janitor] Failed to escalate run ${run_id}: ${String(err)}\n`)
      }
    }

    // Purge expired advisory locks (G-5).
    try {
      const n = await cleanupExpiredLocks()
      if (typeof n === 'number') cleanedLocks = n
    } catch (err) {
      process.stderr.write(`[janitor] Failed to cleanup expired locks: ${String(err)}\n`)
    }

    // TTL-reap abandoned worktrees (H-10, spec §18.6).
    // Dynamic import avoids circular dependency: @fulcrum/worktrees depends on @fulcrum/core.
    // If @fulcrum/worktrees is not installed (e.g. core-only consumers), silently skip.
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — optional peer dep; circular if listed as dep (@fulcrum/worktrees → @fulcrum/core)
      const mod = await import('@fulcrum/worktrees').catch(() => null) as Record<string, unknown> | null
      if (mod && typeof mod.cleanupAbandonedWorktrees === 'function') {
        const n = await mod.cleanupAbandonedWorktrees()
        if (typeof n === 'number') cleanedWorktrees = n
      }
    } catch (err) {
      process.stderr.write(`[janitor] Failed to cleanup abandoned worktrees: ${String(err)}\n`)
    }

    // Memory importance decay (low-importance, stale memories)
    if (input.runDecay !== false) {
      try {
        decayedMemories = decayMemories(input.workspace_id)
      } catch (err) {
        process.stderr.write(`[janitor] Failed to decay memories: ${String(err)}\n`)
      }
    }

    await endSpan({
      span_id: span.span_id,
      status: 'ok',
      payload: {
        cleaned_locks: cleanedLocks,
        cleaned_worktrees: cleanedWorktrees,
        stale_runs: staleRuns,
        escalated_runs: escalatedRuns,
        decayed_memories: decayedMemories,
      },
    })
  } catch (err) {
    await endSpan({
      span_id: span.span_id,
      status: 'error',
      payload: { error: (err as Error).message },
    })
    throw err
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
