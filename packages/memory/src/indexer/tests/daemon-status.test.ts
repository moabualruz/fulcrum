// getStatus handler — daemon returns registry snapshot enriched with
// code_chunks / memories counts per project. See plan Unit 3.1.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('../../pci/syncer.js', () => ({
  startPciSyncer: vi.fn(() => ({ stop: () => {} })),
  contentSha256: vi.fn(() => 'stub'),
  syncFile: vi.fn(async () => ({ action: 'indexed', fileId: 'stub' })),
}))
vi.mock('../../pci/watcher.js', () => ({
  startProjectWatch: vi.fn((root: string) => ({
    rootDir: root,
    watchedDirs: new Set([root]),
    close: () => {},
  })),
}))
vi.mock('../../pci/walker-integration.js', () => ({
  enumerateProjectFiles: vi.fn(async () => ({ files: [], mode: 'fs-walk', skipped: 0 })),
}))

const { startDaemon } = await import('../daemon.js')
const { createDaemonRegistry } = await import('../registry.js')
const { createIndexerClient } = await import('../client.js')

type DaemonHandle = Awaited<ReturnType<typeof startDaemon>>

let tempDir: string
let treeA: string
let treeB: string
let socketPath: string
let daemon: DaemonHandle | null = null

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'fulcrum-status-'))
  treeA = join(tempDir, 'project-a')
  treeB = join(tempDir, 'project-b')
  mkdirSync(treeA)
  mkdirSync(treeB)
  socketPath = join(tempDir, 'indexer.sock')
})

afterEach(async () => {
  if (daemon) { await daemon.close().catch(() => {}); daemon = null }
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* best-effort */ }
})

async function startWithStubRegistry(): Promise<DaemonHandle> {
  const registry = createDaemonRegistry({
    workspaceIdFor: (r) => 'ws_' + r.replace(/[^a-z0-9]/gi, '_'),
    projectIdFor: (r) => 'proj_' + r.replace(/[^a-z0-9]/gi, '_'),
    graceMs: 10,
  })
  return startDaemon({ socketPath, registry })
}

describe('getStatus', () => {
  it('empty registry returns projects: []', async () => {
    daemon = await startWithStubRegistry()
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    try {
      const s = await client.getStatus()
      expect(s.projects).toEqual([])
      expect(typeof s.daemon_started_at).toBe('string')
      expect(s.version).toBe('0.0.2')
    } finally {
      client.close()
    }
  })

  it('returns one entry per active watch with refcount + counts', async () => {
    daemon = await startWithStubRegistry()
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    try {
      await client.ensureWatching(treeA)
      await client.ensureWatching(treeA)
      await client.ensureWatching(treeB)
      const s = await client.getStatus()
      expect(s.projects).toHaveLength(2)
      const a = s.projects.find((p) => p.root === treeA)!
      const b = s.projects.find((p) => p.root === treeB)!
      expect(a.refcount).toBe(2)
      expect(b.refcount).toBe(1)
      // Count fields present (value may be 0 when the DB has no rows for a
      // stub project id — we don't assert a specific number here).
      expect(typeof a.code_chunks_count).toBe('number')
      expect(typeof a.memories_count).toBe('number')
      expect(a.watcher_active).toBe(true)
    } finally {
      client.close()
    }
  })
})
