// packages/core/src/locks.ts
// Advisory file-level locks for concurrent agent workflows (G-5, spec §5.5 / §18.1).
// Non-blocking: acquireLock either succeeds or reports who holds the lock.
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

export async function acquireLock(input: AcquireLockInput): Promise<AcquireLockResult> {
  const db = getDb()
  const ttl = input.ttl_sec ?? DEFAULT_LOCK_TTL_SEC
  const nowMs = Date.now()
  const now = new Date(nowMs).toISOString()
  const expires = new Date(nowMs + ttl * 1000).toISOString()

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
}

export async function releaseLock(lock_id: string): Promise<void> {
  getDb().prepare(`DELETE FROM advisory_locks WHERE lock_id = ?`).run(lock_id)
}

export async function listLocks(workspace_id: string): Promise<Lock[]> {
  const rows = getDb().prepare(
    `SELECT * FROM advisory_locks WHERE workspace_id = ? ORDER BY acquired_at DESC`
  ).all(workspace_id) as Record<string, unknown>[]
  return rows.map(rowToLock)
}

export async function cleanupExpiredLocks(): Promise<number> {
  const now = new Date().toISOString()
  const result = getDb().prepare(`DELETE FROM advisory_locks WHERE expires_at <= ?`).run(now)
  return result.changes
}
