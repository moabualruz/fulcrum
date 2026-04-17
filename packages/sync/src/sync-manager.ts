// packages/sync/src/sync-manager.ts
import { createHash } from 'node:crypto'
import { ulid } from 'ulidx'
import type { Db } from 'fulcrum-agent-core'
import type {
  SyncState,
  SyncConflict,
  SyncResult,
  SyncAdapter,
  SyncObjectInput,
  SyncAllInput,
  GetSyncStateInput,
  ResolveConflictInput,
  ListConflictsInput,
  SyncDirection,
  ConflictState,
} from './types.js'

// Object types that must never be synchronised to external systems.
const NEVER_SYNC: Set<string> = new Set([
  'Memory',
  'PolicyRule',
  'AgentRun',
  'Event',
  'Worktree',
  'HandoffPacket',
  'ArtifactContract',
])

/** Max attempts before a queue item is permanently failed (SYNC-005). */
const MAX_QUEUE_ATTEMPTS = 3

/**
 * Produce a stable SHA-256 hash for an arbitrary object by serialising
 * keys in sorted order at every depth level, preventing hash drift from
 * key insertion order in nested objects (SYNC-008).
 */
function canonicalHash(obj: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(obj, (_, value: unknown) => {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const sorted = value as Record<string, unknown>
        return Object.fromEntries(Object.keys(sorted).sort().map(k => [k, sorted[k]]))
      }
      return value
    }))
    .digest('hex')
}

/**
 * Row returned by better-sqlite3 for sync_states queries.
 * All columns come back as TEXT | INTEGER | null.
 */
interface SyncStateRow {
  sync_id: string
  object_type: string
  object_id: string
  workspace_id: string
  sync_target: string
  external_id: string | null
  last_synced_at: string | null
  sync_status: string
  last_sync_hash: string | null
  last_sync_error: string | null
  direction: SyncDirection
  conflict_state: ConflictState | null
  created_at: string
  updated_at: string
}

function rowToSyncState(row: SyncStateRow): SyncState {
  return {
    sync_id: row.sync_id,
    object_type: row.object_type as SyncState['object_type'],
    object_id: row.object_id,
    workspace_id: row.workspace_id,
    sync_target: row.sync_target,
    external_id: row.external_id ?? undefined,
    last_synced_at: row.last_synced_at ?? undefined,
    sync_status: row.sync_status as SyncState['sync_status'],
    last_sync_hash: row.last_sync_hash ?? undefined,
    last_sync_error: row.last_sync_error ?? undefined,
    direction: row.direction as SyncState['direction'],
    conflict_state: (row.conflict_state ?? 'none') as SyncState['conflict_state'],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

interface ConflictRow {
  conflict_id: string
  sync_id: string
  local_hash: string | null
  remote_hash: string | null
  detected_at: string
  resolution: string | null
  resolved_at: string | null
  resolved_by: string | null
}

function rowToConflict(row: ConflictRow): SyncConflict {
  return {
    conflict_id: row.conflict_id,
    sync_id: row.sync_id,
    local_hash: row.local_hash ?? undefined,
    remote_hash: row.remote_hash ?? undefined,
    detected_at: row.detected_at,
    resolution: row.resolution as SyncConflict['resolution'] ?? undefined,
    resolved_at: row.resolved_at ?? undefined,
    resolved_by: row.resolved_by ?? undefined,
  }
}

export class SyncManager {
  constructor(
    private db: Db,
    private adapter: SyncAdapter,
    /** Optional hook called with serialised local_data before each push.  Throw to abort. */
    private beforePush?: (serialisedData: string) => void,
  ) {}

  // ------------------------------------------------------------------ //
  // syncObject
  // ------------------------------------------------------------------ //

  async syncObject(input: SyncObjectInput): Promise<SyncState> {
    const { object_type, object_id, workspace_id, local_data, sync_target = 'plane' } = input

    // Guard: never-sync types
    if (NEVER_SYNC.has(object_type)) {
      throw new Error(`sync not allowed for: ${object_type}`)
    }

    const hash = canonicalHash(local_data)

    // Upsert sync_states row (INSERT OR IGNORE so we only create once)
    const existing = this.db
      .prepare<[string, string]>(
        `SELECT * FROM sync_states WHERE object_id = ? AND sync_target = ?`,
      )
      .get(object_id, sync_target) as SyncStateRow | undefined

    if (existing) {
      // Idempotency: if hash unchanged, return the current state immediately
      if (existing.last_sync_hash === hash && existing.sync_status === 'synced') {
        return rowToSyncState(existing)
      }
    }

    // Ensure a sync_state row exists
    const sync_id = existing?.sync_id ?? ulid()
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO sync_states
             (sync_id, object_type, object_id, workspace_id, sync_target, sync_status, direction, conflict_state)
           VALUES (?, ?, ?, ?, ?, 'never_synced', 'bidirectional', 'none')`,
        )
        .run(sync_id, object_type, object_id, workspace_id, sync_target)
    }

    // If PLANE_API_KEY is not set, enqueue and return queued state
    if (!process.env['PLANE_API_KEY']) {
      this.db
        .prepare(
          `UPDATE sync_states
              SET sync_status = 'queued', updated_at = datetime('now')
            WHERE sync_id = ?`,
        )
        .run(sync_id)

      const queueId = ulid()
      this.db
        .prepare(
          `INSERT INTO sync_queue (queue_id, sync_id, operation, priority, local_data)
           VALUES (?, ?, 'upsert', 100, ?)`,
        )
        .run(queueId, sync_id, JSON.stringify(local_data))

      const updated = this.db
        .prepare(`SELECT * FROM sync_states WHERE sync_id = ?`)
        .get(sync_id) as SyncStateRow
      return rowToSyncState(updated)
    }

    // Live push path — mark as syncing
    this.db
      .prepare(
        `UPDATE sync_states
            SET sync_status = 'syncing', updated_at = datetime('now')
          WHERE sync_id = ?`,
      )
      .run(sync_id)

    try {
      const currentRow = this.db
        .prepare(`SELECT * FROM sync_states WHERE sync_id = ?`)
        .get(sync_id) as SyncStateRow

      // Detect remote conflict: fetch the current remote hash and compare to what
      // we last saw (last_sync_hash).  If they differ the remote was changed
      // independently — that is a true conflict.  A local-only change is NOT a
      // conflict; it just means we need to push.
      if (currentRow.external_id && currentRow.last_sync_hash) {
        const remoteHash = await this.adapter.getHash(object_type, currentRow.external_id)
        const isConflict = remoteHash !== null && remoteHash !== currentRow.last_sync_hash

        if (isConflict) {
          // Record conflict
          const conflictId = ulid()
          this.db
            .prepare(
              `INSERT INTO sync_conflicts
                 (conflict_id, sync_id, local_hash, remote_hash)
               VALUES (?, ?, ?, ?)`,
            )
            .run(conflictId, sync_id, hash, remoteHash)

          // SYNC-007: do NOT auto-populate resolution — leave NULL so the conflict
          // appears in listConflicts(unresolved_only=true) until an operator calls
          // resolveConflict().
          this.db
            .prepare(
              `UPDATE sync_states
                  SET sync_status = 'conflicted', conflict_state = 'detected', updated_at = datetime('now')
                WHERE sync_id = ?`,
            )
            .run(sync_id)

          const conflictedRow = this.db
            .prepare(`SELECT * FROM sync_states WHERE sync_id = ?`)
            .get(sync_id) as SyncStateRow
          return rowToSyncState(conflictedRow)
        }
      }

      // Push to remote adapter (no conflict — local change wins by default)
      this.beforePush?.(JSON.stringify(local_data))
      const objForPush: Record<string, unknown> = {
        ...local_data,
        external_id: currentRow.external_id ?? undefined,
      }
      const externalId = await this.adapter.push(objForPush)

      this.db
        .prepare(
          `UPDATE sync_states
              SET sync_status = 'synced',
                  external_id = ?,
                  last_sync_hash = ?,
                  last_synced_at = datetime('now'),
                  last_sync_error = NULL,
                  updated_at = datetime('now')
            WHERE sync_id = ?`,
        )
        .run(externalId, hash, sync_id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.db
        .prepare(
          `UPDATE sync_states
              SET sync_status = 'failed',
                  last_sync_error = ?,
                  updated_at = datetime('now')
            WHERE sync_id = ?`,
        )
        .run(message, sync_id)
    }

    const finalRow = this.db
      .prepare(`SELECT * FROM sync_states WHERE sync_id = ?`)
      .get(sync_id) as SyncStateRow
    return rowToSyncState(finalRow)
  }

  // ------------------------------------------------------------------ //
  // syncAll
  // ------------------------------------------------------------------ //

  async syncAll(input: SyncAllInput): Promise<SyncResult> {
    const { workspace_id, object_type, sync_target, batch_size = 50 } = input
    const result: SyncResult = { synced: 0, failed: 0, conflicts: 0, errors: [] }

    // Build a query that fetches queued items ordered by priority DESC, then scheduled_at ASC
    let sql = `
      SELECT sq.queue_id, sq.sync_id, sq.operation, sq.priority, sq.attempts, sq.last_error,
             sq.local_data,
             ss.object_type, ss.object_id, ss.workspace_id, ss.sync_target,
             ss.external_id, ss.last_sync_hash
        FROM sync_queue sq
        JOIN sync_states ss ON ss.sync_id = sq.sync_id
       WHERE ss.workspace_id = ?
    `
    const params: unknown[] = [workspace_id]

    if (object_type) {
      sql += ` AND ss.object_type = ?`
      params.push(object_type)
    }
    if (sync_target) {
      sql += ` AND ss.sync_target = ?`
      params.push(sync_target)
    }

    sql += ` ORDER BY sq.priority DESC, sq.scheduled_at ASC LIMIT ?`
    params.push(batch_size)

    interface QueueRow {
      queue_id: string
      sync_id: string
      operation: string
      priority: number
      attempts: number
      last_error: string | null
      local_data: string | null
      object_type: string
      object_id: string
      workspace_id: string
      sync_target: string
      external_id: string | null
      last_sync_hash: string | null
    }

    const items = this.db.prepare(sql).all(...params) as QueueRow[]

    for (const item of items) {
      // Increment attempts
      this.db
        .prepare(`UPDATE sync_queue SET attempts = attempts + 1 WHERE queue_id = ?`)
        .run(item.queue_id)

      // SYNC-005: enforce max retry cap; permanently fail items that have exhausted attempts
      const newAttempts = item.attempts + 1
      if (newAttempts > MAX_QUEUE_ATTEMPTS) {
        const dlqMsg = `Exceeded max attempts (${MAX_QUEUE_ATTEMPTS}); item permanently failed`
        this.db
          .prepare(`UPDATE sync_queue SET last_error = ? WHERE queue_id = ?`)
          .run(dlqMsg, item.queue_id)
        this.db
          .prepare(`UPDATE sync_states SET sync_status = 'failed', last_sync_error = ?, updated_at = datetime('now') WHERE sync_id = ?`)
          .run(dlqMsg, item.sync_id)
        this.db.prepare(`DELETE FROM sync_queue WHERE queue_id = ?`).run(item.queue_id)
        result.failed++
        result.errors.push(`${item.object_id}: ${dlqMsg}`)
        continue
      }

      try {
        if (item.operation === 'delete') {
          // For delete: mark disabled, no remote call in this implementation
          this.db
            .prepare(
              `UPDATE sync_states
                  SET sync_status = 'disabled', updated_at = datetime('now')
                WHERE sync_id = ?`,
            )
            .run(item.sync_id)
          this.db.prepare(`DELETE FROM sync_queue WHERE queue_id = ?`).run(item.queue_id)
          result.synced++
          continue
        }

        // upsert: deserialise local_data stored when the item was enqueued
        if (!item.local_data) {
          const errMsg = 'local_data missing in queue row; re-enqueue via syncObject'
          this.db
            .prepare(`UPDATE sync_queue SET last_error = ? WHERE queue_id = ?`)
            .run(errMsg, item.queue_id)
          this.db
            .prepare(
              `UPDATE sync_states
                  SET sync_status = 'failed', last_sync_error = ?, updated_at = datetime('now')
                WHERE sync_id = ?`,
            )
            .run(errMsg, item.sync_id)
          result.failed++
          result.errors.push(`${item.object_id}: ${errMsg}`)
          continue
        }

        const localData = JSON.parse(item.local_data) as Record<string, unknown>

        // Secret guard — mirrors the single-object path
        this.beforePush?.(item.local_data)

        const hash = canonicalHash(localData)

        // Push to remote adapter
        const objForPush: Record<string, unknown> = {
          ...localData,
          external_id: item.external_id ?? undefined,
        }
        const externalId = await this.adapter.push(objForPush)

        this.db
          .prepare(
            `UPDATE sync_states
                SET sync_status = 'synced',
                    external_id = ?,
                    last_sync_hash = ?,
                    last_synced_at = datetime('now'),
                    last_sync_error = NULL,
                    updated_at = datetime('now')
              WHERE sync_id = ?`,
          )
          .run(externalId, hash, item.sync_id)

        this.db.prepare(`DELETE FROM sync_queue WHERE queue_id = ?`).run(item.queue_id)
        result.synced++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        this.db
          .prepare(`UPDATE sync_queue SET last_error = ? WHERE queue_id = ?`)
          .run(message, item.queue_id)
        this.db
          .prepare(
            `UPDATE sync_states
                SET sync_status = 'failed', last_sync_error = ?, updated_at = datetime('now')
              WHERE sync_id = ?`,
          )
          .run(message, item.sync_id)
        result.failed++
        result.errors.push(`${item.object_id}: ${message}`)
      }
    }

    return result
  }

  // ------------------------------------------------------------------ //
  // getSyncState
  // ------------------------------------------------------------------ //

  getSyncState(input: GetSyncStateInput): SyncState | null {
    const { object_id, sync_target = 'plane' } = input
    const row = this.db
      .prepare<[string, string]>(
        `SELECT * FROM sync_states WHERE object_id = ? AND sync_target = ?`,
      )
      .get(object_id, sync_target) as SyncStateRow | undefined
    return row ? rowToSyncState(row) : null
  }

  // ------------------------------------------------------------------ //
  // resolveConflict
  // ------------------------------------------------------------------ //

  async resolveConflict(input: ResolveConflictInput): Promise<SyncState> {
    const { conflict_id, resolution, resolved_by, local_data } = input

    const conflictRow = this.db
      .prepare(`SELECT * FROM sync_conflicts WHERE conflict_id = ?`)
      .get(conflict_id) as ConflictRow | undefined

    if (!conflictRow) {
      throw new Error(`Conflict not found: ${conflict_id}`)
    }

    // Record resolution
    this.db
      .prepare(
        `UPDATE sync_conflicts
            SET resolution = ?,
                resolved_at = datetime('now'),
                resolved_by = ?
          WHERE conflict_id = ?`,
      )
      .run(resolution, resolved_by ?? null, conflict_id)

    const syncStateRow = this.db
      .prepare(`SELECT * FROM sync_states WHERE sync_id = ?`)
      .get(conflictRow.sync_id) as SyncStateRow

    if (resolution === 'local_wins') {
      if (!local_data) {
        throw new Error('local_data is required for local_wins resolution')
      }
      // Re-enqueue for push, including local_data so processQueue can push it (SYNC-009 fix)
      const queueId = ulid()
      this.db
        .prepare(
          `INSERT INTO sync_queue (queue_id, sync_id, operation, priority, local_data)
           VALUES (?, ?, 'upsert', 200, ?)`,
        )
        .run(queueId, conflictRow.sync_id, JSON.stringify(local_data))

      this.db
        .prepare(
          `UPDATE sync_states
              SET sync_status = 'queued',
                  conflict_state = 'resolved',
                  updated_at = datetime('now')
            WHERE sync_id = ?`,
        )
        .run(conflictRow.sync_id)
    } else if (resolution === 'remote_wins') {
      // Pull remote data and mark as synced
      if (syncStateRow.external_id) {
        await this.adapter.pull(syncStateRow.external_id)
        // In a full implementation, the pulled data would be written back to the
        // local domain object via a domain callback. Here we mark the state as synced.
      }
      this.db
        .prepare(
          `UPDATE sync_states
              SET sync_status = 'synced',
                  conflict_state = 'resolved',
                  last_synced_at = datetime('now'),
                  updated_at = datetime('now')
            WHERE sync_id = ?`,
        )
        .run(conflictRow.sync_id)
    } else {
      // manual — set conflict_state to resolved, leave status as-is
      this.db
        .prepare(
          `UPDATE sync_states
              SET conflict_state = 'resolved',
                  updated_at = datetime('now')
            WHERE sync_id = ?`,
        )
        .run(conflictRow.sync_id)
    }

    const updatedRow = this.db
      .prepare(`SELECT * FROM sync_states WHERE sync_id = ?`)
      .get(conflictRow.sync_id) as SyncStateRow
    return rowToSyncState(updatedRow)
  }

  // ------------------------------------------------------------------ //
  // listConflicts
  // ------------------------------------------------------------------ //

  listConflicts(input: ListConflictsInput): SyncConflict[] {
    const { workspace_id, sync_target, unresolved_only = false } = input

    let sql = `
      SELECT sc.*
        FROM sync_conflicts sc
        JOIN sync_states ss ON ss.sync_id = sc.sync_id
       WHERE ss.workspace_id = ?
    `
    const params: unknown[] = [workspace_id]

    if (sync_target) {
      sql += ` AND ss.sync_target = ?`
      params.push(sync_target)
    }
    if (unresolved_only) {
      sql += ` AND sc.resolution IS NULL`
    }

    sql += ` ORDER BY sc.detected_at DESC`

    const rows = this.db.prepare(sql).all(...params) as ConflictRow[]
    return rows.map(rowToConflict)
  }
}
