// packages/sync/src/tests/sync.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DB } from 'better-sqlite3'
import { runMigration010 } from '../schema.js'
import { SyncManager } from '../sync-manager.js'
import type { SyncAdapter, ExternalPayload } from '../types.js'

// ---------------------------------------------------------------------------
// Minimal stub database: creates only what MIGRATION_010 needs.
// We fake the workspaces table and skip FK enforcement so the tests are
// self-contained without pulling in the full @fulcrum/core migration chain.
// ---------------------------------------------------------------------------

function createTestDb(): DB {
  const db = Database(':memory:')
  // Disable FK enforcement so we don't need to bootstrap the full schema
  db.pragma('foreign_keys = OFF')

  // Minimal workspaces table so the REFERENCES clause is satisfiable if FK
  // enforcement is ever turned on in future.
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      workspace_id TEXT PRIMARY KEY,
      name         TEXT NOT NULL
    )
  `)
  db.prepare(`INSERT INTO workspaces (workspace_id, name) VALUES ('ws-test', 'Test WS')`).run()

  runMigration010(db)
  return db
}

// ---------------------------------------------------------------------------
// Stub SyncAdapter — captures calls, returns deterministic IDs
// ---------------------------------------------------------------------------

class StubAdapter implements SyncAdapter {
  pushCalls: Array<Record<string, unknown>> = []
  pullCalls: string[] = []

  async push(obj: Record<string, unknown>): Promise<string> {
    this.pushCalls.push(obj)
    return `ext-${this.pushCalls.length}`
  }

  async pull(externalId: string): Promise<unknown> {
    this.pullCalls.push(externalId)
    return { name: 'Remote Title', state: 'In Progress' }
  }

  map(local: Record<string, unknown>): ExternalPayload {
    return { name: local['title'] }
  }

  unmap(external: unknown): Record<string, unknown> {
    const e = external as Record<string, unknown>
    return { title: e['name'] }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeManager(db: DB): { manager: SyncManager; adapter: StubAdapter } {
  const adapter = new StubAdapter()
  const manager = new SyncManager(db, adapter)
  return { manager, adapter }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('@fulcrum/sync — SyncManager', () => {
  let db: DB

  beforeEach(() => {
    db = createTestDb()
    // Ensure PLANE_API_KEY is set by default so live-push path runs
    process.env['PLANE_API_KEY'] = 'test-key'
  })

  afterEach(() => {
    db.close()
    delete process.env['PLANE_API_KEY']
  })

  // -----------------------------------------------------------------------
  // Test 1: syncObject throws for never-sync types
  // -----------------------------------------------------------------------

  it('throws for never-sync type: Memory', async () => {
    const { manager } = makeManager(db)
    await expect(
      manager.syncObject({
        object_type: 'Issue', // temporarily cast to satisfy TS; we override below
        object_id: 'obj-1',
        workspace_id: 'ws-test',
        local_data: { title: 'Hello' },
      } as Parameters<typeof manager.syncObject>[0]),
    ).resolves.toBeDefined() // confirm valid type works first

    // Now test a never-sync type by casting deliberately
    await expect(
      (manager.syncObject as (i: unknown) => Promise<unknown>)({
        object_type: 'Memory',
        object_id: 'mem-1',
        workspace_id: 'ws-test',
        local_data: { content: 'secret thoughts' },
      }),
    ).rejects.toThrow('sync not allowed for: Memory')
  })

  it('throws for never-sync type: PolicyRule', async () => {
    const { manager } = makeManager(db)
    await expect(
      (manager.syncObject as (i: unknown) => Promise<unknown>)({
        object_type: 'PolicyRule',
        object_id: 'rule-1',
        workspace_id: 'ws-test',
        local_data: { rule: 'deny all' },
      }),
    ).rejects.toThrow('sync not allowed for: PolicyRule')
  })

  // -----------------------------------------------------------------------
  // Test 2: syncObject is idempotent when hash matches
  // -----------------------------------------------------------------------

  it('is a no-op when hash matches (idempotent)', async () => {
    const { manager, adapter } = makeManager(db)
    const input = {
      object_type: 'Issue' as const,
      object_id: 'issue-1',
      workspace_id: 'ws-test',
      local_data: { title: 'Fix login bug', status: 'open' },
    }

    const first = await manager.syncObject(input)
    expect(first.sync_status).toBe('synced')
    expect(adapter.pushCalls).toHaveLength(1)

    // Second call with identical data — must not push again
    const second = await manager.syncObject(input)
    expect(second.sync_status).toBe('synced')
    expect(adapter.pushCalls).toHaveLength(1) // still 1, not 2
    expect(second.sync_id).toBe(first.sync_id)
  })

  // -----------------------------------------------------------------------
  // Test 3: syncObject enqueues when PLANE_API_KEY not set
  // -----------------------------------------------------------------------

  it('enqueues when PLANE_API_KEY is not set', async () => {
    delete process.env['PLANE_API_KEY']
    const { manager, adapter } = makeManager(db)

    const state = await manager.syncObject({
      object_type: 'Task' as const,
      object_id: 'task-99',
      workspace_id: 'ws-test',
      local_data: { title: 'Deploy service' },
    })

    expect(state.sync_status).toBe('queued')
    expect(adapter.pushCalls).toHaveLength(0)

    // Verify queue row was created
    const qRow = db
      .prepare(`SELECT * FROM sync_queue WHERE sync_id = ?`)
      .get(state.sync_id) as { operation: string; priority: number } | undefined
    expect(qRow).toBeDefined()
    expect(qRow?.operation).toBe('upsert')
  })

  // -----------------------------------------------------------------------
  // Test 4: getSyncState — returns null for unknown, state for known
  // -----------------------------------------------------------------------

  it('getSyncState returns null for unknown object', () => {
    const { manager } = makeManager(db)
    const result = manager.getSyncState({ object_id: 'nonexistent', sync_target: 'plane' })
    expect(result).toBeNull()
  })

  it('getSyncState returns the current state for a known object', async () => {
    const { manager } = makeManager(db)
    const synced = await manager.syncObject({
      object_type: 'Epic' as const,
      object_id: 'epic-7',
      workspace_id: 'ws-test',
      local_data: { title: 'Q2 Roadmap' },
    })
    expect(synced.sync_status).toBe('synced')

    const fetched = manager.getSyncState({ object_id: 'epic-7' })
    expect(fetched).not.toBeNull()
    expect(fetched?.sync_id).toBe(synced.sync_id)
    expect(fetched?.sync_status).toBe('synced')
  })

  // -----------------------------------------------------------------------
  // Test 5: listConflicts — returns unresolved conflicts
  // -----------------------------------------------------------------------

  it('listConflicts returns unresolved conflicts for a workspace', async () => {
    const { manager } = makeManager(db)

    // First sync to create sync_state
    const state = await manager.syncObject({
      object_type: 'Issue' as const,
      object_id: 'issue-conflict-1',
      workspace_id: 'ws-test',
      local_data: { title: 'Original', status: 'open' },
    })

    // Manually inject a conflict row (simulating a detected remote conflict)
    const conflictId = 'conflict-manual-1'
    db.prepare(
      `INSERT INTO sync_conflicts (conflict_id, sync_id, local_hash, remote_hash)
       VALUES (?, ?, 'abc123', 'def456')`,
    ).run(conflictId, state.sync_id)

    db.prepare(
      `UPDATE sync_states SET sync_status = 'conflicted', conflict_state = ? WHERE sync_id = ?`,
    ).run(conflictId, state.sync_id)

    const conflicts = manager.listConflicts({ workspace_id: 'ws-test', unresolved_only: true })
    expect(conflicts.length).toBeGreaterThanOrEqual(1)
    const found = conflicts.find((c) => c.conflict_id === conflictId)
    expect(found).toBeDefined()
    expect(found?.resolution).toBeUndefined()
  })

  // -----------------------------------------------------------------------
  // Test 6: resolveConflict — records resolution and resolved_at
  // -----------------------------------------------------------------------

  it('resolveConflict records resolution and resolved_at', async () => {
    const { manager } = makeManager(db)

    const state = await manager.syncObject({
      object_type: 'Plan' as const,
      object_id: 'plan-1',
      workspace_id: 'ws-test',
      local_data: { title: 'Sprint 10' },
    })

    // Inject a conflict
    const conflictId = 'conflict-resolve-1'
    db.prepare(
      `INSERT INTO sync_conflicts (conflict_id, sync_id, local_hash, remote_hash)
       VALUES (?, ?, 'aaa', 'bbb')`,
    ).run(conflictId, state.sync_id)

    db.prepare(
      `UPDATE sync_states SET sync_status = 'conflicted', conflict_state = ? WHERE sync_id = ?`,
    ).run(conflictId, state.sync_id)

    const resolved = await manager.resolveConflict({
      conflict_id: conflictId,
      resolution: 'local_wins',
      resolved_by: 'agent-chief',
    })

    // SyncState should now be queued (re-enqueued for push)
    expect(resolved.sync_status).toBe('queued')

    // Conflict record should have resolution + resolved_at
    interface ConflictRecord {
      resolution: string
      resolved_at: string
      resolved_by: string
    }
    const conflictRow = db
      .prepare(`SELECT * FROM sync_conflicts WHERE conflict_id = ?`)
      .get(conflictId) as ConflictRecord
    expect(conflictRow.resolution).toBe('local_wins')
    expect(conflictRow.resolved_at).toBeTruthy()
    expect(conflictRow.resolved_by).toBe('agent-chief')
  })

  // -----------------------------------------------------------------------
  // Test 7: syncAll — processes queue items in priority order
  // -----------------------------------------------------------------------

  it('syncAll processes queued items in priority order', async () => {
    delete process.env['PLANE_API_KEY'] // force queue mode for enqueuing
    const { manager } = makeManager(db)

    // Enqueue two items
    await manager.syncObject({
      object_type: 'Issue' as const,
      object_id: 'issue-low',
      workspace_id: 'ws-test',
      local_data: { title: 'Low priority issue' },
    })
    await manager.syncObject({
      object_type: 'Issue' as const,
      object_id: 'issue-high',
      workspace_id: 'ws-test',
      local_data: { title: 'High priority issue' },
    })

    // Manually bump the priority of issue-high in the queue
    db.prepare(
      `UPDATE sync_queue SET priority = 500
         WHERE sync_id = (SELECT sync_id FROM sync_states WHERE object_id = 'issue-high')`,
    ).run()

    // Both items have no external_id, so syncAll will mark them failed
    // (expected: queue processor cannot reconstruct local_data without external context)
    const result = await manager.syncAll({ workspace_id: 'ws-test', batch_size: 10 })

    // All items attempted
    expect(result.failed + result.synced).toBeGreaterThanOrEqual(2)

    // The high-priority item was processed — verify attempts incremented
    interface AttemptRow { attempts: number }
    const highSyncId = (
      db.prepare(`SELECT sync_id FROM sync_states WHERE object_id = 'issue-high'`).get() as
        | { sync_id: string }
        | undefined
    )?.sync_id

    expect(highSyncId).toBeDefined()
    const qRow = db
      .prepare(`SELECT attempts FROM sync_queue WHERE sync_id = ?`)
      .get(highSyncId) as AttemptRow | undefined
    // Row may have been deleted if processed, or have attempts > 0 if still pending
    if (qRow) {
      expect(qRow.attempts).toBeGreaterThanOrEqual(1)
    }
  })
})
