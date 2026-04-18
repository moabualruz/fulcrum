// Idle-timeout auto-exit. See plan Unit 3.3.
//
// Daemon self-exits once (active_watches === 0) AND (no request has arrived
// for `idleTimeoutMs`). An active watch keeps the daemon alive even without
// requests. Every request resets the idle clock.

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
let socketPath: string
let daemon: DaemonHandle | null = null

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'fulcrum-idle-'))
  socketPath = join(tempDir, 'indexer.sock')
})

afterEach(async () => {
  if (daemon) { await daemon.close().catch(() => {}); daemon = null }
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* best-effort */ }
})

function makeRegistry(): ReturnType<typeof createDaemonRegistry> {
  return createDaemonRegistry({
    workspaceIdFor: () => 'ws_test',
    projectIdFor: () => 'proj_test',
    graceMs: 10,
  })
}

describe('daemon idle timeout', () => {
  it('fires shutdown after idleTimeoutMs elapses with no watches and no requests', async () => {
    // Short timeout so the test is fast (50ms).
    daemon = await startDaemon({ socketPath, idleTimeoutMs: 80, registry: makeRegistry() })
    const closed = new Promise<void>((resolve) => daemon!.server.once('close', resolve))
    await closed
    // Server closed → listening address becomes unavailable.
    expect(daemon.server.listening).toBe(false)
  })

  it('stays up indefinitely while a watch is active', async () => {
    daemon = await startDaemon({ socketPath, idleTimeoutMs: 80, registry: makeRegistry() })
    const tree = join(tempDir, 'alive-tree')
    mkdirSync(tree, { recursive: true })
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    try {
      await client.ensureWatching(tree)
      // Wait well past the nominal idle timeout.
      await new Promise((r) => setTimeout(r, 200))
      expect(daemon.server.listening).toBe(true)
    } finally {
      client.close()
    }
  })

  it('request arrival resets the idle clock', async () => {
    daemon = await startDaemon({ socketPath, idleTimeoutMs: 100, registry: makeRegistry() })
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    try {
      await new Promise((r) => setTimeout(r, 60)) // nearly idle
      await client.ping()                         // resets clock
      await new Promise((r) => setTimeout(r, 60)) // would have fired without reset
      expect(daemon.server.listening).toBe(true)
    } finally {
      client.close()
    }
  })
})
