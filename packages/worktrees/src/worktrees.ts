// packages/worktrees/src/worktrees.ts
import { getDb, FulcrumError, newId, canMerge, type AgentRole } from '@fulcrum/core'
import type {
  Worktree,
  MergeResult,
  AllocateWorktreeInput,
  MarkDirtyInput,
  MarkReadyInput,
  EnqueueMergeInput,
  DiscardWorktreeInput,
} from './types.js'

function rowToWorktree(row: Record<string, unknown>): Worktree {
  return {
    worktree_id: row.worktree_id as string,
    workspace_id: row.workspace_id as string,
    project_id: row.project_id as string,
    status: row.status as Worktree['status'],
    branch_name: row.branch_name as string,
    path: row.path as string,
    task_id: (row.task_id as string | null) ?? undefined,
    run_id: (row.run_id as string | null) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    merged_at: (row.merged_at as string | null) ?? undefined,
    discarded_at: (row.discarded_at as string | null) ?? undefined,
  }
}

export async function allocateWorktree(input: AllocateWorktreeInput): Promise<Worktree> {
  const db = getDb()
  const worktree_id = newId('worktree')
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO worktrees
      (worktree_id, workspace_id, project_id, status, branch_name, path, task_id, run_id, created_at, updated_at)
    VALUES
      (?, ?, ?, 'allocated', ?, ?, ?, ?, ?, ?)
  `).run(
    worktree_id,
    input.workspace_id,
    input.project_id,
    input.branch_name,
    input.path,
    input.task_id ?? null,
    input.run_id ?? null,
    now,
    now,
  )

  const row = db
    .prepare('SELECT * FROM worktrees WHERE worktree_id = ?')
    .get(worktree_id) as Record<string, unknown>

  return rowToWorktree(row)
}

export async function markDirty(input: MarkDirtyInput): Promise<Worktree> {
  const db = getDb()
  const now = new Date().toISOString()

  const current = db
    .prepare('SELECT status FROM worktrees WHERE worktree_id = ?')
    .get(input.worktree_id) as { status: string } | undefined

  if (!current) throw new FulcrumError(`Worktree not found: ${input.worktree_id}`, 'not_found')
  if (current.status !== 'allocated') {
    throw new FulcrumError(
      `Cannot mark worktree ${input.worktree_id} as dirty: status is '${current.status}', expected 'allocated'`,
      'invalid_state'
    )
  }

  db.prepare(`
    UPDATE worktrees SET status = 'dirty', updated_at = ? WHERE worktree_id = ?
  `).run(now, input.worktree_id)

  const row = db
    .prepare('SELECT * FROM worktrees WHERE worktree_id = ?')
    .get(input.worktree_id) as Record<string, unknown>

  return rowToWorktree(row)
}

export async function markReadyForMerge(input: MarkReadyInput): Promise<Worktree> {
  const db = getDb()
  const now = new Date().toISOString()

  const current = db
    .prepare('SELECT status FROM worktrees WHERE worktree_id = ?')
    .get(input.worktree_id) as { status: string } | undefined

  if (!current) throw new FulcrumError(`Worktree not found: ${input.worktree_id}`, 'not_found')
  if (current.status !== 'dirty') {
    throw new FulcrumError(
      `Cannot mark worktree ${input.worktree_id} as ready_for_merge: status is '${current.status}', expected 'dirty'`,
      'invalid_state'
    )
  }

  db.prepare(`
    UPDATE worktrees SET status = 'ready_for_merge', updated_at = ? WHERE worktree_id = ?
  `).run(now, input.worktree_id)

  const row = db
    .prepare('SELECT * FROM worktrees WHERE worktree_id = ?')
    .get(input.worktree_id) as Record<string, unknown>

  return rowToWorktree(row)
}

export async function enqueueMerge(input: EnqueueMergeInput): Promise<void> {
  // enqueueMerge is a no-op at the DB level — the worktree is already marked
  // ready_for_merge. This function exists so callers can set a priority hint
  // in the future. For now it validates the worktree exists and is in the
  // correct state before returning.
  const db = getDb()
  const row = db
    .prepare(`SELECT status FROM worktrees WHERE worktree_id = ?`)
    .get(input.worktree_id) as { status: string } | undefined

  if (!row) throw new Error(`Worktree not found: ${input.worktree_id}`)
  if (row.status !== 'ready_for_merge') {
    throw new Error(
      `Cannot enqueue worktree ${input.worktree_id}: status is '${row.status}', expected 'ready_for_merge'`
    )
  }
}

export async function processMergeQueue(
  projectId: string,
  callerRole: string
): Promise<MergeResult[]> {
  if (!canMerge(callerRole as AgentRole)) {
    throw new Error('POLICY_DENIED: only integration_worker may process merge queue')
  }

  const db = getDb()
  const queue = db
    .prepare(`
      SELECT * FROM worktrees
      WHERE project_id = ? AND status = 'ready_for_merge'
      ORDER BY created_at ASC
    `)
    .all(projectId) as Array<Record<string, unknown>>

  const results: MergeResult[] = []
  const now = new Date().toISOString()

  for (const row of queue) {
    const worktree_id = row.worktree_id as string
    const branch_name = row.branch_name as string

    try {
      db.prepare(`
        UPDATE worktrees
        SET status = 'merged', merged_at = ?, updated_at = ?
        WHERE worktree_id = ?
      `).run(now, now, worktree_id)

      results.push({ worktree_id, branch_name, success: true, merged_at: now })
    } catch (err) {
      results.push({
        worktree_id,
        branch_name,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}

export async function discardWorktree(input: DiscardWorktreeInput): Promise<void> {
  const db = getDb()
  const now = new Date().toISOString()

  const current = db
    .prepare('SELECT status FROM worktrees WHERE worktree_id = ?')
    .get(input.worktree_id) as { status: string } | undefined

  if (!current) throw new FulcrumError(`Worktree not found: ${input.worktree_id}`, 'not_found')
  if (current.status === 'merged' || current.status === 'discarded') {
    throw new FulcrumError(
      `Cannot discard worktree ${input.worktree_id}: status is already '${current.status}'`,
      'invalid_state'
    )
  }

  db.prepare(`
    UPDATE worktrees
    SET status = 'discarded', discarded_at = ?, updated_at = ?
    WHERE worktree_id = ?
  `).run(now, now, input.worktree_id)
}

export interface CleanupAbandonedWorktreesInput {
  /** TTL in seconds. Worktrees older than this with cleanup-eligible status are removed. */
  ttl_sec?: number
}

/**
 * Remove worktree rows whose status indicates completion/abandonment AND whose
 * updated_at is older than the TTL. The git worktree directory is NOT touched
 * here — that's a separate concern (H-3 deferred). This just reaps DB state
 * so the merge queue and board views stop listing stale rows.
 *
 * Spec §18.6 — janitor reaps abandoned worktrees (H-10).
 */
export async function cleanupAbandonedWorktrees(
  input: CleanupAbandonedWorktreesInput = {}
): Promise<number> {
  const db = getDb()
  const ttl_sec = input.ttl_sec ?? 24 * 60 * 60 // default 24h
  const cutoff = new Date(Date.now() - ttl_sec * 1000).toISOString()
  const result = db
    .prepare(
      `DELETE FROM worktrees
       WHERE status IN ('discarded','merged') AND updated_at < ?`
    )
    .run(cutoff)
  return result.changes
}

export async function listMergeQueue(projectId: string): Promise<Worktree[]> {
  const db = getDb()
  const rows = db
    .prepare(`
      SELECT * FROM worktrees
      WHERE project_id = ? AND status = 'ready_for_merge'
      ORDER BY created_at ASC
    `)
    .all(projectId) as Array<Record<string, unknown>>

  return rows.map(rowToWorktree)
}
