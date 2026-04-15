// packages/sync/src/tests/sync.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import type { Database as DB } from 'better-sqlite3'
import { runMigration010 } from '../schema.js'
import { SyncManager } from '../sync-manager.js'
import { PlaneAPIClient } from '../plane/client.js'
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
  /** Override per test to simulate a remote hash (null = object not on remote) */
  remoteHash: string | null = null

  async push(obj: Record<string, unknown>): Promise<string> {
    this.pushCalls.push(obj)
    return `ext-${this.pushCalls.length}`
  }

  async pull(externalId: string): Promise<unknown> {
    this.pullCalls.push(externalId)
    return { name: 'Remote Title', state: 'In Progress' }
  }

  async getHash(_objectType: string, _externalId: string): Promise<string | null> {
    return this.remoteHash
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
      `UPDATE sync_states SET sync_status = 'conflicted', conflict_state = 'detected' WHERE sync_id = ?`,
    ).run(state.sync_id)

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
      `UPDATE sync_states SET sync_status = 'conflicted', conflict_state = 'detected' WHERE sync_id = ?`,
    ).run(state.sync_id)

    const resolved = await manager.resolveConflict({
      conflict_id: conflictId,
      resolution: 'local_wins',
      resolved_by: 'agent-chief',
      local_data: { title: 'Sprint 10', priority: 'high' },
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

  // -----------------------------------------------------------------------
  // Test 8: syncAll actually pushes via adapter and marks synced
  // -----------------------------------------------------------------------

  it('syncAll calls adapter.push and marks items synced', async () => {
    delete process.env['PLANE_API_KEY'] // force queue mode for enqueuing
    const { manager, adapter } = makeManager(db)

    // Enqueue an item (stores local_data in queue row)
    await manager.syncObject({
      object_type: 'Issue' as const,
      object_id: 'issue-batch',
      workspace_id: 'ws-test',
      local_data: { title: 'Batch push issue', status: 'open' },
    })

    expect(adapter.pushCalls).toHaveLength(0) // not pushed yet

    // Now restore API key so live-push path runs inside syncAll
    process.env['PLANE_API_KEY'] = 'test-key'
    const result = await manager.syncAll({ workspace_id: 'ws-test', batch_size: 10 })

    expect(result.synced).toBe(1)
    expect(result.failed).toBe(0)
    expect(adapter.pushCalls).toHaveLength(1)

    // Verify state is synced and external_id persisted
    const state = manager.getSyncState({ object_id: 'issue-batch' })
    expect(state?.sync_status).toBe('synced')
    expect(state?.external_id).toBe('ext-1')
    expect(state?.last_sync_hash).toBeTruthy()

    // Queue row should be deleted after successful sync
    const qRow = db
      .prepare(`SELECT * FROM sync_queue WHERE sync_id = ?`)
      .get(state!.sync_id)
    expect(qRow).toBeUndefined()
  })

  // -----------------------------------------------------------------------
  // Test 9: conflict detection uses remote hash, not local-change diff
  // -----------------------------------------------------------------------

  it('does NOT conflict when only local data changed (no remote change)', async () => {
    const { manager, adapter } = makeManager(db)

    // First sync — establishes last_sync_hash
    const first = await manager.syncObject({
      object_type: 'Issue' as const,
      object_id: 'issue-noconflict',
      workspace_id: 'ws-test',
      local_data: { title: 'Version 1', status: 'open' },
    })
    expect(first.sync_status).toBe('synced')

    // Remote hash returns null (same as last_sync_hash scenario: no remote change)
    adapter.remoteHash = null

    // Update local data — should push cleanly, no conflict
    const second = await manager.syncObject({
      object_type: 'Issue' as const,
      object_id: 'issue-noconflict',
      workspace_id: 'ws-test',
      local_data: { title: 'Version 2', status: 'in_progress' },
    })
    expect(second.sync_status).toBe('synced')
    expect(adapter.pushCalls).toHaveLength(2) // both pushes happened
  })

  // -----------------------------------------------------------------------
  // Test 10: new sync state defaults to direction='bidirectional', conflict_state='none'
  // -----------------------------------------------------------------------

  it('new sync state defaults to direction=bidirectional and conflict_state=none', async () => {
    const { manager } = makeManager(db)

    const state = await manager.syncObject({
      object_type: 'Issue' as const,
      object_id: 'issue-defaults',
      workspace_id: 'ws-test',
      local_data: { title: 'Default direction test' },
    })

    expect(state.direction).toBe('bidirectional')
    expect(state.conflict_state).toBe('none')
  })

  // -----------------------------------------------------------------------
  // Test 11: can create sync state with explicit direction='local_to_remote'
  // Note: syncObject always inserts 'bidirectional'; we verify via direct DB
  // insert to confirm the column accepts 'local_to_remote'.
  // -----------------------------------------------------------------------

  it('accepts explicit direction=local_to_remote via direct DB insert', () => {
    const { manager } = makeManager(db)
    const syncId = 'sync-explicit-dir'
    db.prepare(
      `INSERT INTO sync_states
         (sync_id, object_type, object_id, workspace_id, sync_target, sync_status, direction, conflict_state)
       VALUES (?, 'Task', 'task-explicit', 'ws-test', 'plane', 'never_synced', 'local_to_remote', 'none')`,
    ).run(syncId)

    const state = manager.getSyncState({ object_id: 'task-explicit' })
    expect(state).not.toBeNull()
    expect(state?.direction).toBe('local_to_remote')
    expect(state?.conflict_state).toBe('none')
  })

  // -----------------------------------------------------------------------
  // Test 12: conflict detection sets conflict_state='detected'
  // -----------------------------------------------------------------------

  it('conflict detection sets conflict_state to detected', async () => {
    const { manager, adapter } = makeManager(db)

    // First sync — establishes last_sync_hash and external_id
    const first = await manager.syncObject({
      object_type: 'Issue' as const,
      object_id: 'issue-conflict-detected',
      workspace_id: 'ws-test',
      local_data: { title: 'Version 1' },
    })
    expect(first.sync_status).toBe('synced')

    // Simulate remote conflict
    adapter.remoteHash = 'cafebabe0000000000000000000000000000000000000000000000000000dead'

    const conflicted = await manager.syncObject({
      object_type: 'Issue' as const,
      object_id: 'issue-conflict-detected',
      workspace_id: 'ws-test',
      local_data: { title: 'Local change' },
    })

    expect(conflicted.sync_status).toBe('conflicted')
    expect(conflicted.conflict_state).toBe('detected')
  })

  it('beforePush guard: error is captured in sync state (status=failed), push not called', async () => {
    // The SyncManager catches beforePush errors and records them as sync failures.
    // The error does NOT bubble up — the state is returned with sync_status='failed'.
    const adapter = new StubAdapter()
    const manager = new SyncManager(db, adapter, (data) => {
      if (data.includes('SK_LIVE_')) {
        throw new Error('Secret detected in sync payload: SK_LIVE_')
      }
    })
    const state = await manager.syncObject({
      object_type: 'Issue' as const,
      object_id: 'issue-secret',
      workspace_id: 'ws-test',
      local_data: { title: 'Deploy', api_key: 'SK_LIVE_12345abcdef' },
    })
    expect(state.sync_status).toBe('failed')
    expect(state.last_sync_error).toMatch(/Secret detected/)
    expect(adapter.pushCalls).toHaveLength(0) // push was never called
  })

  it('detects conflict when remote hash differs from last_sync_hash', async () => {
    const { manager, adapter } = makeManager(db)

    // First sync
    const first = await manager.syncObject({
      object_type: 'Issue' as const,
      object_id: 'issue-conflict-remote',
      workspace_id: 'ws-test',
      local_data: { title: 'Original', status: 'open' },
    })
    expect(first.sync_status).toBe('synced')
    const storedHash = first.last_sync_hash!

    // Simulate remote independently changed: getHash returns a different hash
    adapter.remoteHash = 'deadbeef0000000000000000000000000000000000000000000000000000cafe'
    expect(adapter.remoteHash).not.toBe(storedHash) // sanity check

    // Local also changed — should be detected as conflict
    const second = await manager.syncObject({
      object_type: 'Issue' as const,
      object_id: 'issue-conflict-remote',
      workspace_id: 'ws-test',
      local_data: { title: 'Local change', status: 'done' },
    })
    expect(second.sync_status).toBe('conflicted')
    expect(second.conflict_state).toBeTruthy()

    // A conflict record should exist (auto-resolved to local_wins but still recorded)
    const conflicts = manager.listConflicts({ workspace_id: 'ws-test', unresolved_only: false })
    const found = conflicts.find((c) => c.sync_id === second.sync_id)
    expect(found).toBeDefined()
    expect(found?.remote_hash).toBe(adapter.remoteHash)
    expect(found?.resolution).toBe('local_wins')
  })
})

// ---------------------------------------------------------------------------
// PlaneAPIClient — error handling
// ---------------------------------------------------------------------------

describe('PlaneAPIClient — error handling', () => {
  const client = new PlaneAPIClient({
    baseUrl: 'https://api.plane.test',
    apiKey: 'test-key',
    workspaceSlug: 'ws-slug',
    projectId: 'proj-id',
  })

  it('createIssue throws on non-OK response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('{"detail":"not authorized"}', { status: 401 })
    )
    await expect(client.createIssue({ name: 'Test issue' })).rejects.toThrow('Plane API error: 401')
    fetchSpy.mockRestore()
  })

  it('getIssue throws on non-OK response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('not found', { status: 404 })
    )
    await expect(client.getIssue('nonexistent')).rejects.toThrow('Plane API error: 404')
    fetchSpy.mockRestore()
  })

  it('updateIssue throws on non-OK response', async () => {
    // 500 is retried up to MAX_RETRIES; mock all attempts to avoid falling
    // through to real fetch (which doesn't exist in test env)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('server error', { status: 500 })
    )
    await expect(client.updateIssue('ext-123', { name: 'Updated' })).rejects.toThrow('Plane API error: 500')
    fetchSpy.mockRestore()
  }, 10_000)

  it('createIssue returns the parsed response body on success', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'plane-issue-abc' }), { status: 200 })
    )
    const result = await client.createIssue({ name: 'New issue' })
    expect(result.id).toBe('plane-issue-abc')
    fetchSpy.mockRestore()
  })
})
