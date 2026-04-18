// DaemonRegistry tests. See plan Unit 2.1.
//
// These tests stub the chokidar-level work (startPciSyncer) so we can focus
// on refcount + consolidation + grace-timer semantics. A separate integration
// test (daemon-watch-consolidation.test.ts) exercises the real syncer.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Stub the syncer BEFORE we import the registry. Each ensure() call should
// trigger exactly one startPciSyncer() invocation; teardown calls stop().
const startedRoots: string[] = []
const stoppedRoots: string[] = []

vi.mock('../../pci/syncer.js', () => ({
  startPciSyncer: vi.fn((opts: { projectRoot: string }) => {
    startedRoots.push(opts.projectRoot)
    return { stop: () => { stoppedRoots.push(opts.projectRoot) } }
  }),
  contentSha256: vi.fn(() => 'stub'),
  syncFile: vi.fn(async () => ({ action: 'indexed', fileId: 'stub' })),
}))

const watchClosedRoots: string[] = []
vi.mock('../../pci/watcher.js', () => ({
  startProjectWatch: vi.fn((root: string) => ({
    rootDir: root,
    watchedDirs: new Set([root]),
    close: () => { watchClosedRoots.push(root) },
  })),
}))

vi.mock('../../pci/walker-integration.js', () => ({
  enumerateProjectFiles: vi.fn(async () => ({ files: [], mode: 'fs-walk', skipped: 0 })),
}))

// Import after the mock is registered.
const { createDaemonRegistry } = await import('../registry.js')
const { VaultOwnedPathError } = await import('../../pci/vault-guard.js')

let tempRoot: string
let subA: string
let subB: string
let registry: ReturnType<typeof createDaemonRegistry>

beforeEach(() => {
  startedRoots.length = 0
  stoppedRoots.length = 0
  watchClosedRoots.length = 0
  tempRoot = mkdtempSync(join(tmpdir(), 'fulcrum-registry-'))
  subA = join(tempRoot, 'a', 'b')
  subB = join(tempRoot, 'a', 'b', 'c')
  mkdirSync(subB, { recursive: true })
  registry = createDaemonRegistry({
    workspaceIdFor: () => 'ws_test',
    projectIdFor: () => 'proj_test',
    graceMs: 50, // keep tests fast
  })
})

afterEach(() => {
  registry.shutdownAll()
  try { rmSync(tempRoot, { recursive: true, force: true }) } catch { /* best-effort */ }
})

describe('ensureWatching — fresh mount', () => {
  it('first call on a root starts exactly one syncer', () => {
    const r = registry.ensureWatching(subA)
    expect(r.already_watched).toBe(false)
    expect(r.relative_path).toBe('')
    expect(r.watch).toBe(subA)
    expect(startedRoots).toHaveLength(1)
    expect(startedRoots[0]).toBe(subA)
  })

  it('second call on the same root re-uses the existing syncer (refcount = 2)', () => {
    registry.ensureWatching(subA)
    const second = registry.ensureWatching(subA)
    expect(second.already_watched).toBe(true)
    expect(startedRoots).toHaveLength(1) // no second start
    expect(registry.getRefcount(subA)).toBe(2)
  })
})

describe('ensureWatching — watch consolidation', () => {
  it('call on a child of an existing watch returns the parent watch + relative_path', () => {
    registry.ensureWatching(subA)
    const r = registry.ensureWatching(subB)
    expect(r.already_watched).toBe(true)
    expect(r.watch).toBe(subA)
    expect(r.relative_path).toBe('c')
    expect(startedRoots).toHaveLength(1) // no second watcher
    expect(registry.getRefcount(subA)).toBe(2)
  })

  it('call on a new sibling after a deeper watch creates a separate watcher', () => {
    registry.ensureWatching(subB)
    const sibling = join(tempRoot, 'a', 'different')
    mkdirSync(sibling, { recursive: true })
    const r = registry.ensureWatching(sibling)
    expect(r.already_watched).toBe(false)
    expect(r.watch).toBe(sibling)
    expect(startedRoots).toHaveLength(2)
  })
})

describe('releaseWatching — refcount + grace teardown', () => {
  it('releasing once when refcount was 2 keeps the watcher running', () => {
    registry.ensureWatching(subA)
    registry.ensureWatching(subA)
    const r = registry.releaseWatching(subA)
    expect(r.refcount).toBe(1)
    expect(stoppedRoots).toHaveLength(0)
  })

  it('releasing to zero schedules teardown after the grace period', async () => {
    vi.useFakeTimers()
    registry.ensureWatching(subA)
    registry.releaseWatching(subA)
    expect(stoppedRoots).toHaveLength(0) // not yet
    await vi.advanceTimersByTimeAsync(60)
    expect(stoppedRoots).toEqual([subA])
    vi.useRealTimers()
  })

  it('ensure-during-grace cancels the teardown', async () => {
    vi.useFakeTimers()
    registry.ensureWatching(subA)
    registry.releaseWatching(subA)
    await vi.advanceTimersByTimeAsync(20)
    // Re-ensure while grace is running.
    const r = registry.ensureWatching(subA)
    expect(r.already_watched).toBe(true)
    await vi.advanceTimersByTimeAsync(100) // well past grace
    expect(stoppedRoots).toHaveLength(0)
    expect(registry.getRefcount(subA)).toBe(1)
    vi.useRealTimers()
  })

  it('releasing a root that was never ensured throws HandlerError(not_watching)', async () => {
    const { HandlerError } = await import('../handlers.js')
    let caught: unknown
    try { registry.releaseWatching(subA) } catch (err) { caught = err }
    expect(caught).toBeInstanceOf(HandlerError)
    expect((caught as InstanceType<typeof HandlerError>).code).toBe('not_watching')
  })
})

describe('vault-owned-path rejection', () => {
  it('ensureWatching refuses paths under globalDataDir()/memory', () => {
    // globalDataDir()/memory is the vault; construct a child path that
    // resolves under it. We use the FULCRUM_DATA_DIR env override so the
    // resolved vault prefix sits under tempRoot.
    process.env['FULCRUM_DATA_DIR'] = tempRoot
    const vaultChild = join(tempRoot, 'memory', 'workspaces', 'test')
    mkdirSync(vaultChild, { recursive: true })
    expect(() => registry.ensureWatching(vaultChild)).toThrow(VaultOwnedPathError)
    delete process.env['FULCRUM_DATA_DIR']
  })
})

describe('shutdownAll', () => {
  it('tears down every watcher and clears state', () => {
    const sibling = join(tempRoot, 'b')
    mkdirSync(sibling, { recursive: true })
    registry.ensureWatching(subA)
    registry.ensureWatching(sibling)
    expect(startedRoots).toHaveLength(2)
    registry.shutdownAll()
    expect(stoppedRoots.sort()).toEqual([subA, sibling].sort())
    expect(registry.getRefcount(subA)).toBe(0)
  })
})

describe('getStatus', () => {
  it('returns one entry per active watch with refcount', () => {
    registry.ensureWatching(subA)
    registry.ensureWatching(subA)
    const status = registry.getStatus()
    expect(status.projects).toHaveLength(1)
    expect(status.projects[0]).toMatchObject({
      root: subA,
      refcount: 2,
      watcher_active: true,
    })
  })

  it('empty registry returns projects: []', () => {
    expect(registry.getStatus().projects).toEqual([])
  })
})
