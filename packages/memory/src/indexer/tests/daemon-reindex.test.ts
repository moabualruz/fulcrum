// triggerReindex tests — daemon forces ingestProject on a requested root,
// dedupes concurrent reindex requests for the same root. See plan Unit 3.2.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Spy on ingestProject so we can assert dedup + call counts without running
// the real writer (which needs a live DB with migrations applied).
const ingestCalls: Array<{ root_path: string; when: number }> = []
vi.mock('../../ingest.js', () => ({
  ingestProject: vi.fn(async (input: { root_path: string }) => {
    const start = Date.now()
    ingestCalls.push({ root_path: input.root_path, when: start })
    // Simulate a slow walk so two racing calls can collide.
    await new Promise((r) => setTimeout(r, 80))
    return { chunks_created: 3, memories_created: 1, errors: [] }
  }),
  ingestFile: vi.fn(),
}))

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
let tree: string
let socketPath: string
let daemon: DaemonHandle | null = null

beforeEach(() => {
  ingestCalls.length = 0
  tempDir = mkdtempSync(join(tmpdir(), 'fulcrum-reindex-'))
  tree = join(tempDir, 'proj')
  mkdirSync(tree)
  writeFileSync(join(tree, 'a.ts'), 'export const x = 1\n')
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

describe('triggerReindex', () => {
  it('calls ingestProject and returns chunks_created + took_ms', async () => {
    daemon = await startWithStubRegistry()
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    try {
      const r = await client.request<{ chunks_created: number; memories_created: number; errors: number; took_ms: number }>(
        'triggerReindex',
        { root: tree },
      )
      expect(r.chunks_created).toBe(3)
      expect(r.memories_created).toBe(1)
      expect(r.errors).toBe(0)
      expect(typeof r.took_ms).toBe('number')
      expect(ingestCalls).toHaveLength(1)
      expect(ingestCalls[0]!.root_path).toBe(tree)
    } finally {
      client.close()
    }
  })

  it('dedupes two concurrent reindex requests for the same root (single ingestProject)', async () => {
    daemon = await startWithStubRegistry()
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    try {
      const [r1, r2] = await Promise.all([
        client.request('triggerReindex', { root: tree }),
        client.request('triggerReindex', { root: tree }),
      ])
      expect(r1).toEqual(r2)
      expect(ingestCalls).toHaveLength(1) // deduped
    } finally {
      client.close()
    }
  })

  it('reports invalid_params for missing or relative root', async () => {
    daemon = await startWithStubRegistry()
    const client = createIndexerClient({ socketPath, disableAutoSpawn: true })
    try {
      await expect(client.request('triggerReindex', {})).rejects.toMatchObject({ code: 'invalid_params' })
      await expect(client.request('triggerReindex', { root: './rel' })).rejects.toMatchObject({ code: 'invalid_params' })
    } finally {
      client.close()
    }
  })
})
