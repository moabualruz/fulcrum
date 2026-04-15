import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, closeDb } from '../db/client.js'
import { runMigrations } from '../db/migrations.js'
import { createWorkspace } from '../workspaces.js'
import { acquireLock, releaseLock, listLocks, cleanupExpiredLocks } from '../locks.js'

describe('advisory locks (G-5)', () => {
  beforeEach(async () => {
    closeDb()
    const db = new Database(':memory:')
    runMigrations(db)
    setDb(db)
    await createWorkspace({ workspace_id: 'ws_1', name: 'w' })
  })

  it('acquireLock on a fresh resource returns acquired=true with lock_id', async () => {
    const result = await acquireLock({
      workspace_id: 'ws_1', resource_path: 'src/foo.ts', run_id: 'run_1', ttl_sec: 60,
    })
    expect(result.acquired).toBe(true)
    expect(result.lock_id).toMatch(/^lock_/)
    expect(result.held_by).toBe('run_1')
    expect(result.expires_at).toBeTruthy()
  })

  it('a second acquire on the same resource returns acquired=false with held_by of the holder', async () => {
    await acquireLock({ workspace_id: 'ws_1', resource_path: 'src/foo.ts', run_id: 'run_1', ttl_sec: 60 })
    const second = await acquireLock({
      workspace_id: 'ws_1', resource_path: 'src/foo.ts', run_id: 'run_2', ttl_sec: 60,
    })
    expect(second.acquired).toBe(false)
    expect(second.lock_id).toBeNull()
    expect(second.held_by).toBe('run_1')
  })

  it('releaseLock frees the resource when called by the owner', async () => {
    const first = await acquireLock({ workspace_id: 'ws_1', resource_path: 'src/foo.ts', run_id: 'run_1', ttl_sec: 60 })
    expect(first.lock_id).not.toBeNull()
    const released = await releaseLock(first.lock_id!, 'run_1')
    expect(released).toBe(true)
    const second = await acquireLock({
      workspace_id: 'ws_1', resource_path: 'src/foo.ts', run_id: 'run_2', ttl_sec: 60,
    })
    expect(second.acquired).toBe(true)
  })

  it('releaseLock by a non-owner returns false and leaves the lock intact', async () => {
    const first = await acquireLock({ workspace_id: 'ws_1', resource_path: 'src/foo.ts', run_id: 'run_1', ttl_sec: 60 })
    expect(first.lock_id).not.toBeNull()
    // run_2 tries to release a lock it doesn't own
    const released = await releaseLock(first.lock_id!, 'run_2')
    expect(released).toBe(false)
    // Lock should still exist — run_1 still holds it
    const attempt = await acquireLock({
      workspace_id: 'ws_1', resource_path: 'src/foo.ts', run_id: 'run_2', ttl_sec: 60,
    })
    expect(attempt.acquired).toBe(false)
    expect(attempt.held_by).toBe('run_1')
  })

  it('listLocks returns active locks for a workspace', async () => {
    await acquireLock({ workspace_id: 'ws_1', resource_path: 'a', run_id: 'r1', ttl_sec: 60 })
    await acquireLock({ workspace_id: 'ws_1', resource_path: 'b', run_id: 'r2', ttl_sec: 60 })
    const locks = await listLocks('ws_1')
    expect(locks.length).toBe(2)
    const paths = locks.map(l => l.resource_path).sort()
    expect(paths).toEqual(['a', 'b'])
  })

  it('listLocks does not leak across workspaces', async () => {
    await createWorkspace({ workspace_id: 'ws_2', name: 'w2' })
    await acquireLock({ workspace_id: 'ws_1', resource_path: 'a', run_id: 'r1', ttl_sec: 60 })
    await acquireLock({ workspace_id: 'ws_2', resource_path: 'a', run_id: 'r2', ttl_sec: 60 })
    const ws1Locks = await listLocks('ws_1')
    expect(ws1Locks.length).toBe(1)
    expect(ws1Locks[0].workspace_id).toBe('ws_1')
  })

  it('cleanupExpiredLocks removes rows with expires_at in the past', async () => {
    // ttl_sec: 0 → the lock is immediately expired
    await acquireLock({ workspace_id: 'ws_1', resource_path: 'x', run_id: 'r1', ttl_sec: 0 })
    const deleted = await cleanupExpiredLocks()
    expect(deleted).toBeGreaterThanOrEqual(1)
    expect((await listLocks('ws_1')).length).toBe(0)
  })

  it('re-acquire after expiry succeeds (purges stale row implicitly)', async () => {
    await acquireLock({ workspace_id: 'ws_1', resource_path: 'x', run_id: 'r1', ttl_sec: 0 })
    // Don't call cleanupExpiredLocks — acquireLock should purge stale rows on its own
    const second = await acquireLock({
      workspace_id: 'ws_1', resource_path: 'x', run_id: 'r2', ttl_sec: 60,
    })
    expect(second.acquired).toBe(true)
    expect(second.held_by).toBe('r2')
  })
})
