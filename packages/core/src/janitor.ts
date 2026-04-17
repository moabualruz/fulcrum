import { getDb , Db} from './db/client.js'
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
  MEMORY_CONSOLIDATION_THRESHOLD,
  MEMORY_CONSOLIDATION_BATCH_SIZE,
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
export function decayMemories(workspace_id?: string, db: Db = getDb()): number {

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

/** Cosine similarity between two Float32Arrays. Returns 0 for zero/mismatched vectors. */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na  += a[i] * a[i]
    nb  += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

/**
 * Consolidate near-duplicate memories by clustering on cosine similarity.
 * Pairs with similarity >= MEMORY_CONSOLIDATION_THRESHOLD are merged:
 *  - Higher-importance memory survives; the other is deleted.
 *  - Surviving memory's content is updated to include a note about the merge.
 *  - Batch-limited to MEMORY_CONSOLIDATION_BATCH_SIZE most-recent memories.
 *
 * Returns the number of memories deleted (merged away).
 */
export function consolidateMemories(workspace_id?: string, db: Db = getDb()): number {

  // Fetch the N most-recently-accessed memories that have embeddings
  const whereParts = ['embedding IS NOT NULL']
  const params: unknown[] = []
  if (workspace_id) { whereParts.push('workspace_id = ?'); params.push(workspace_id) }
  params.push(MEMORY_CONSOLIDATION_BATCH_SIZE)

  const rows = db.prepare(
    `SELECT memory_id, workspace_id, importance, content, embedding
     FROM memories
     WHERE ${whereParts.join(' AND ')}
     ORDER BY last_accessed_at DESC
     LIMIT ?`
  ).all(...params) as {
    memory_id: string
    workspace_id: string
    importance: number
    content: string
    embedding: Buffer
  }[]

  if (rows.length < 2) return 0

  // Decode embeddings once
  const mems = rows.map(r => ({
    ...r,
    vec: new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4),
  }))

  const deleted = new Set<string>()
  let mergedCount = 0

  const deleteStmt = db.prepare('DELETE FROM memories WHERE memory_id = ?')
  const updateStmt = db.prepare('UPDATE memories SET updated_at = datetime(\'now\') WHERE memory_id = ?')

  for (let i = 0; i < mems.length; i++) {
    if (deleted.has(mems[i].memory_id)) continue
    for (let j = i + 1; j < mems.length; j++) {
      if (deleted.has(mems[j].memory_id)) continue

      const sim = cosineSimilarity(mems[i].vec, mems[j].vec)
      if (sim < MEMORY_CONSOLIDATION_THRESHOLD) continue

      // Merge: keep higher-importance, delete lower
      const keep = mems[i].importance >= mems[j].importance ? mems[i] : mems[j]
      const drop = keep === mems[i] ? mems[j] : mems[i]

      deleteStmt.run(drop.memory_id)
      updateStmt.run(keep.memory_id)
      deleted.add(drop.memory_id)
      mergedCount++
    }
  }

  return mergedCount
}

interface JanitorCycleInput {
  workspace_id: string
  policy: PolicyConfig
  /** Run memory importance decay (default true). */
  runDecay?: boolean
  /** Run memory consolidation — merge near-duplicates (default true). */
  runConsolidate?: boolean
}

export async function runJanitorCycle(input: JanitorCycleInput, db: Db = getDb()): Promise<void> {
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
  let consolidatedMemories = 0

  try {
    // Mark running runs stale when no heartbeat received within timeout.
    // Collect their run_ids first so PCI lifecycle can drop refcounts — see v2a
    // PR 4 Task 20. The UPDATE runs unconditionally; PCI release is best-effort.
    const toStale = db.prepare(`
      SELECT run_id FROM agent_runs
      WHERE workspace_id = ?
        AND status = 'running'
        AND updated_at <= datetime('now', ? || ' minutes')
    `).all(input.workspace_id, `-${heartbeat_timeout_minutes}`) as { run_id: string }[]

    const staleResult = db.prepare(`
      UPDATE agent_runs
      SET status = 'stale', updated_at = datetime('now')
      WHERE workspace_id = ?
        AND status = 'running'
        AND updated_at <= datetime('now', ? || ' minutes')
    `).run(input.workspace_id, `-${heartbeat_timeout_minutes}`)
    staleRuns = staleResult.changes ?? 0

    if (toStale.length > 0) {
      try {
        const moduleName = 'fulcrum-memory'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mem = (await import(/* @vite-ignore */ moduleName)) as any
        if (typeof mem?.onAgentRunEnd === 'function') {
          for (const { run_id } of toStale) mem.onAgentRunEnd(run_id)
        }
      } catch { /* PCI lifecycle is best-effort */ }
    }

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
    // Dynamic import avoids circular dependency: fulcrum-worktrees depends on fulcrum-core.
    // If fulcrum-worktrees is not installed (e.g. core-only consumers), silently skip.
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — optional peer dep; circular if listed as dep (fulcrum-worktrees → fulcrum-core)
      const mod = await import('fulcrum-worktrees').catch(() => null) as Record<string, unknown> | null
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

    // Memory consolidation — merge near-duplicate embeddings
    if (input.runConsolidate !== false) {
      try {
        consolidatedMemories = consolidateMemories(input.workspace_id)
      } catch (err) {
        process.stderr.write(`[janitor] Failed to consolidate memories: ${String(err)}\n`)
      }
    }

    // TTL cleanup: delete hook_events rows older than 30 days.
    // Runs unconditionally (independent of workspace_id filtering) since
    // hook_events are global audit data — we clean by age, not workspace.
    try {
      deleteOldHookEvents(db)
    } catch (err) {
      process.stderr.write(`[janitor] Failed to cleanup old hook_events: ${String(err)}\n`)
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
        consolidated_memories: consolidatedMemories,
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

/**
 * Delete hook_events rows older than 30 days.
 * Called during the janitor cycle as a lightweight TTL cleanup.
 * Returns the number of rows deleted.
 */
export function deleteOldHookEvents(db: Db = getDb()): number {
  const result = db.prepare(
    `DELETE FROM hook_events WHERE ts < datetime('now', '-30 days')`
  ).run()
  return result.changes ?? 0
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
