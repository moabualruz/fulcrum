// v2a PR 9 Task 45 — session-scope expiration sweep.
//
// Daily sweep that DELETEs `memories WHERE expires_at IS NOT NULL AND
// expires_at < unixepoch()`. Runs:
//   1. As an idempotent CLI command (`fulcrum memory sweep-expired`).
//   2. On a 24h timer inside the MCP server lifecycle (NOT the PCI
//      singleton — singleton tears down 30s after refcount→0 and would
//      never fire the sweep in normal multi-session use).
//   3. Opportunistically at the top of every start_agent_run — cheap
//      predicate-indexed DELETE bounds row accumulation between MCP
//      restarts.

import type { Db } from '@moabualruz/fulcrum-core'
import { getDb } from '@moabualruz/fulcrum-core'

const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24h

export interface SweepResult {
  rowsDeleted: number
  ranAt: string
}

/**
 * Idempotent expiration sweep. Returns the row count deleted + the run
 * timestamp. Safe to call concurrently — the SQLite DELETE is atomic.
 */
export function sweepExpiredMemories(db: Db = getDb()): SweepResult {
  const ranAt = new Date().toISOString()
  const result = db.prepare(`DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at < (unixepoch() * 1000)`).run()
  return { rowsDeleted: result.changes, ranAt }
}

let _timer: NodeJS.Timeout | null = null

/**
 * Start the daily sweep timer. Called by the MCP server lifecycle. Idempotent
 * — calling twice doesn't double the timer.
 */
export function startSweepTimer(db: Db = getDb(), intervalMs: number = SWEEP_INTERVAL_MS): { stop: () => void } {
  if (_timer) clearInterval(_timer)
  // Run once at startup to clear any backlog.
  try { sweepExpiredMemories(db) } catch { /* non-fatal */ }
  _timer = setInterval(() => {
    try { sweepExpiredMemories(db) } catch { /* non-fatal */ }
  }, intervalMs)
  return {
    stop: () => {
      if (_timer) clearInterval(_timer)
      _timer = null
    },
  }
}

/**
 * Cheap opportunistic sweep — called from start_agent_run. The predicate is
 * indexed (idx_memories_expires partial index from PR 1 Task 1) so the
 * DELETE is bounded even on large memories tables.
 */
export function opportunisticSweep(db: Db = getDb()): SweepResult {
  return sweepExpiredMemories(db)
}
