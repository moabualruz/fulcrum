// End-to-end: spawn a real daemon (in-process), connect a real client, exercise
// ensureWatching + releaseWatching with Watchman-style consolidation and
// vault-rejection. Uses a stub registry to avoid a real chokidar mount.
//
// See plan Unit 2.2 / 2.3.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startDaemon, type DaemonHandle } from '../daemon.js'
import { createDaemonRegistry } from '../registry.js'
import { createIndexerClient, IndexerError } from '../client.js'

// Stub startPciSyncer — we test refcount + wire behavior, not chokidar.
import { vi } from 'vitest'
vi.mock('../../pci/syncer.js', () => ({
  startPciSyncer: vi.fn(() => ({ stop: () => {} })),
  contentSha256: vi.fn(() => 'stub'),
  syncFile: vi.fn(),
}))

let tempDir: string
let treeRoot: string
let socketPath: string
let daemon: DaemonHandle | null = null

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'fulcrum-dwc-'))
  treeRoot = join(tempDir, 'tree')
  mkdirSync(treeRoot, { recursive: true })
  socketPath = join(tempDir, 'indexer.sock')
})

afterEach(async () => {
  if (daemon) { await daemon.close().catch(() => {}); daemon = null }
  try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* best-effort */ }
})

async function startWithStubRegistry(): Promise<DaemonHandle> {
  const registry = createDaemonRegistry({
    workspaceIdFor: () => 'ws_test',
    projectIdFor: () => 'proj_test',
    graceMs: 10,
  })
  return startDaemon({ socketPath, registry })
}

describe('daemon ensureWatching / releaseWatching — end-to-end', () => {
  it('first ensureWatching establishes the watch; second on a child consolidates', async () => {
    daemon = await startWithStubRegistry()
    mkdirSync(join(treeRoot, 'a', 'b'), { recursive: true })
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    try {
      const first = await client.ensureWatching(treeRoot)
      expect(first).toMatchObject({ watch: treeRoot, relative_path: '', already_watched: false })

      const child = await client.ensureWatching(join(treeRoot, 'a', 'b'))
      expect(child.watch).toBe(treeRoot)
      expect(child.relative_path).toBe(join('a', 'b'))
      expect(child.already_watched).toBe(true)
    } finally {
      client.close()
    }
  })

  it('invalid params — missing root', async () => {
    daemon = await startWithStubRegistry()
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    try {
      await expect(client.request('ensureWatching', {})).rejects.toMatchObject({ code: 'invalid_params' })
    } finally {
      client.close()
    }
  })

  it('invalid params — relative path', async () => {
    daemon = await startWithStubRegistry()
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    try {
      await expect(client.ensureWatching('./relative')).rejects.toMatchObject({ code: 'invalid_params' })
    } finally {
      client.close()
    }
  })

  it('releaseWatching on an un-ensured root returns not_watching', async () => {
    daemon = await startWithStubRegistry()
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    try {
      await expect(client.releaseWatching(treeRoot)).rejects.toMatchObject({ code: 'not_watching' })
    } finally {
      client.close()
    }
  })

  it('vault-owned path is rejected with vault_owned_path code', async () => {
    daemon = await startWithStubRegistry()
    // Point the vault prefix inside tempDir so we can construct a child.
    process.env['FULCRUM_DATA_DIR'] = tempDir
    const vaultChild = join(tempDir, 'memory', 'workspaces', 'x')
    mkdirSync(vaultChild, { recursive: true })
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    try {
      await expect(client.ensureWatching(vaultChild)).rejects.toMatchObject({ code: 'vault_owned_path' })
    } finally {
      client.close()
      delete process.env['FULCRUM_DATA_DIR']
    }
  })

  it('ensure + release balances refcount back to zero across the wire', async () => {
    daemon = await startWithStubRegistry()
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    try {
      await client.ensureWatching(treeRoot)
      await client.ensureWatching(treeRoot)
      const r1 = await client.releaseWatching(treeRoot)
      expect(r1.refcount).toBe(1)
      const r2 = await client.releaseWatching(treeRoot)
      expect(r2.refcount).toBe(0)
    } finally {
      client.close()
    }
  })
})
