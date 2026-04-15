// packages/core/src/locks.ts
/**
 * Advisory file-level locks for concurrent agent workflows (G-5, H-7).
 *
 * These locks are **exclusive only**: at most one `(workspace_id, resource_path)`
 * tuple holds a lock at any given time, and a subsequent `acquireLock` call on
 * the same resource returns `acquired=false` with the current holder's `run_id`.
 * The call is non-blocking — it never waits.
 *
 * The spec (`pi_local_first_agent_os_spec.md`) is silent on reader/writer lock
 * semantics. §18.1 is "Worktree rule" — "Worktrees are used only for parallel
 * write runs in git repos" — which describes isolation via worktrees rather
 * than via in-process shared/exclusive mode locks. §5.7 mentions that non-git
 * projects "use weaker write isolation", but does not pin down a multi-reader
 * / single-writer contract. The closest concrete directive is §18.7
 * "Non-git writing: Sequential by default", which is trivially satisfied by
 * exclusive-only advisory locks.
 *
 * If future work requires shared/reader locks (e.g., two runs reading the same
 * resource while a third wants to write), extend `AcquireLockInput` with a
 * `mode: 'shared' | 'exclusive'` field, add a `mode` column to `advisory_locks`
 * via a new migration, and update the conflict check. See H-7 in the Round 2
 * gap-fix plan for the history of this decision.
 */
import { getDb } from './db/client.js'
import { newId } from './ids.js'
import { DEFAULT_LOCK_TTL_SEC } from './constants.js'

export interface AcquireLockInput {
  workspace_id: string
  resource_path: string
  run_id: string
  ttl_sec?: number
}

export interface AcquireLockResult {
  acquired: boolean
  lock_id: string | null
  held_by: string | null
  expires_at: string | null
}

export interface Lock {
  lock_id: string
  workspace_id: string
  resource_path: string
  run_id: string
  acquired_at: string
  expires_at: string
}

function rowToLock(row: Record<string, unknown>): Lock {
  return {
    lock_id: row['lock_id'] as string,
    workspace_id: row['workspace_id'] as string,
    resource_path: row['resource_path'] as string,
    run_id: row['run_id'] as string,
    acquired_at: row['acquired_at'] as string,
    expires_at: row['expires_at'] as string,
  }
}

export async function acquireLock(input: AcquireLockInput, db = getDb()): Promise<AcquireLockResult> {
  const ttl = input.ttl_sec ?? DEFAULT_LOCK_TTL_SEC
  const nowMs = Date.now()
  const now = new Date(nowMs).toISOString()
  const expires = new Date(nowMs + ttl * 1000).toISOString()

  return db.transaction((): AcquireLockResult => {
    // Purge any stale lock on this resource first so re-acquisition works.
    db.prepare(
      `DELETE FROM advisory_locks WHERE workspace_id = ? AND resource_path = ? AND expires_at <= ?`
    ).run(input.workspace_id, input.resource_path, now)

    const existing = db.prepare(
      `SELECT * FROM advisory_locks WHERE workspace_id = ? AND resource_path = ? LIMIT 1`
    ).get(input.workspace_id, input.resource_path) as Record<string, unknown> | undefined

    if (existing) {
      return {
        acquired: false,
        lock_id: null,
        held_by: existing['run_id'] as string,
        expires_at: existing['expires_at'] as string,
      }
    }

    const lock_id = newId('lock')
    db.prepare(
      `INSERT INTO advisory_locks (lock_id, workspace_id, resource_path, run_id, acquired_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(lock_id, input.workspace_id, input.resource_path, input.run_id, now, expires)

    return {
      acquired: true,
      lock_id,
      held_by: input.run_id,
      expires_at: expires,
    }
  })()
}

export async function releaseLock(lock_id: string, run_id: string, db = getDb()): Promise<boolean> {
  const result = db.prepare(`DELETE FROM advisory_locks WHERE lock_id = ? AND run_id = ?`).run(lock_id, run_id)
  return result.changes === 1
}

export async function listLocks(workspace_id: string, db = getDb()): Promise<Lock[]> {
  const rows = db.prepare(
    `SELECT * FROM advisory_locks WHERE workspace_id = ? ORDER BY acquired_at DESC`
  ).all(workspace_id) as Record<string, unknown>[]
  return rows.map(rowToLock)
}

export async function cleanupExpiredLocks(db = getDb()): Promise<number> {
  const now = new Date().toISOString()
  const result = db.prepare(`DELETE FROM advisory_locks WHERE expires_at <= ?`).run(now)
  return result.changes
}
