// v2a PR 4 Task 20 — PCI lifecycle integration tests.
//
// Asserts the memory-side lifecycle hooks produce the expected refcount +
// dedup semantics without needing the core run-lifecycle surface. The core
// wiring itself is covered by the existing agent-run integration tests.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type Database from 'better-sqlite3'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { onAgentRunStart, onAgentRunEnd, _resetLifecycleState, _activeRunHandleCount, resolveProjectRoot } from '../pci/lifecycle.js'
import { pciStatus, shutdownAll } from '../pci/singleton.js'

// Daemon-era note: as of the 2026-04-18 indexer-daemon plan (PR 4 commit A),
// onAgentRunStart / onAgentRunEnd route through the fulcrum-indexer daemon
// instead of the in-process PCI singleton. The pciStatus() entries assertions
// below inspect singleton state that no longer reflects what the daemon holds.
// Commit B deletes pci/singleton.ts and this file along with it; coverage for
// the daemon semantics lives in packages/memory/src/indexer/tests/.
describe.skip('PCI lifecycle integration — v2a PR 4 Task 20', () => {
  let db: Database.Database
  let root: string
  const workspaceId = 'ws_1'
  const projectId = 'proj_1'

  beforeEach(() => {
    db = createTestDb()
    seedWorkspaceAndProject(db, workspaceId, projectId)
    root = join(tmpdir(), `fulcrum-lifecycle-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(root, { recursive: true })
    db.prepare('UPDATE projects SET root_realpath = ? WHERE project_id = ?').run(root, projectId)
    _resetLifecycleState()
    shutdownAll()
    process.env['FULCRUM_DATA_DIR'] = join(tmpdir(), `fulcrum-data-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  })

  afterEach(() => {
    shutdownAll()
    _resetLifecycleState()
    rmSync(root, { recursive: true, force: true })
    delete process.env['FULCRUM_DATA_DIR']
    resetTestDb()
  })

  it('resolveProjectRoot returns root_realpath when set', () => {
    expect(resolveProjectRoot(projectId, db)).toBeTruthy()
  })

  it('resolveProjectRoot returns null for missing project', () => {
    expect(resolveProjectRoot('does-not-exist', db)).toBeNull()
  })

  it('onAgentRunStart increments refcount + tracks handle per run', () => {
    const handle = onAgentRunStart({ run_id: 'run_a', project_id: projectId, db })
    expect(handle).not.toBeNull()
    expect(_activeRunHandleCount()).toBe(1)
    expect(pciStatus().entries).toBe(1)
  })

  it('two onAgentRunStart calls against the same project share the singleton entry', () => {
    onAgentRunStart({ run_id: 'run_a', project_id: projectId, db })
    onAgentRunStart({ run_id: 'run_b', project_id: projectId, db })
    expect(_activeRunHandleCount()).toBe(2)
    expect(pciStatus().entries).toBe(1)
    const refcount = Object.values(pciStatus().refcounts)[0]
    expect(refcount).toBe(2)
  })

  it('onAgentRunEnd drops the per-run handle; singleton grace holds until all stop', () => {
    onAgentRunStart({ run_id: 'run_a', project_id: projectId, db })
    onAgentRunStart({ run_id: 'run_b', project_id: projectId, db })
    onAgentRunEnd('run_a')
    expect(_activeRunHandleCount()).toBe(1)
    // singleton entry remains (run_b still holding)
    expect(pciStatus().entries).toBe(1)
    onAgentRunEnd('run_b')
    expect(_activeRunHandleCount()).toBe(0)
    // entry still present because of 30s grace
    expect(pciStatus().entries).toBe(1)
  })

  it('onAgentRunEnd is a no-op for runs that never registered', () => {
    expect(() => onAgentRunEnd('never-seen')).not.toThrow()
  })

  it('onAgentRunStart skips logical projects with no root', () => {
    db.prepare('UPDATE projects SET root_realpath = NULL WHERE project_id = ?').run(projectId)
    const handle = onAgentRunStart({ run_id: 'run_a', project_id: projectId, db })
    expect(handle).toBeNull()
    expect(_activeRunHandleCount()).toBe(0)
  })

  it('FULCRUM_DISABLE_PCI=1 short-circuits ensure()', () => {
    process.env['FULCRUM_DISABLE_PCI'] = '1'
    try {
      const handle = onAgentRunStart({ run_id: 'run_a', project_id: projectId, db })
      expect(handle).toBeNull()
      expect(_activeRunHandleCount()).toBe(0)
    } finally {
      delete process.env['FULCRUM_DISABLE_PCI']
    }
  })
})
