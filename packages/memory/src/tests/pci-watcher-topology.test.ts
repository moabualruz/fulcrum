import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { watchDirectory, closeWatcherSubtree, isMissingPathError, getPathStats, activeWatcherCount } from '../pci/watcher.js'
import { resetContentChangeBus, getContentChangeBus, type ContentChangeEvent } from '@moabualruz/fulcrum-core'

describe('watchDirectory — v2a PR 4 Task 17 (native mode)', () => {
  let root: string
  beforeEach(() => {
    resetContentChangeBus()
    root = join(tmpdir(), `fulcrum-watcher-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(root, { recursive: true })
  })
  afterEach(() => {
    closeWatcherSubtree(root)
    rmSync(root, { recursive: true, force: true })
  })

  it('returns a handle with mode + fs + close()', () => {
    const h = watchDirectory(root)
    expect(h.dir).toBe(root)
    expect(['native', 'polling']).toContain(h.mode)
    expect(typeof h.close).toBe('function')
  })

  it('is idempotent — same dir returns same handle', () => {
    const h1 = watchDirectory(root)
    const h2 = watchDirectory(root)
    expect(h1).toBe(h2)
  })

  it('close() removes the watcher and decreases activeWatcherCount', () => {
    const before = activeWatcherCount()
    const h = watchDirectory(root)
    expect(activeWatcherCount()).toBe(before + 1)
    h.close()
    expect(activeWatcherCount()).toBe(before)
  })

  it('emits ContentChangeEvent on file change (native mode only — debounced 100ms)', async () => {
    if (process.platform === 'win32') return // fs.watch semantics differ

    const h = watchDirectory(root, { forcedFsKind: 'native' })
    if (h.mode !== 'native') {
      h.close()
      return
    }
    const seen: ContentChangeEvent[] = []
    getContentChangeBus().on(e => { seen.push(e) })

    writeFileSync(join(root, 'a.ts'), 'hello\n')
    await new Promise(r => setTimeout(r, 250))
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[0]!.kind).toBe('code')
    h.close()
  })

  it('shouldIgnore predicate skips matching events', async () => {
    if (process.platform === 'win32') return
    const h = watchDirectory(root, { forcedFsKind: 'native', shouldIgnore: p => p.endsWith('.skip') })
    const seen: ContentChangeEvent[] = []
    getContentChangeBus().on(e => { seen.push(e) })

    writeFileSync(join(root, 'a.skip'), 'x\n')
    writeFileSync(join(root, 'b.ts'), 'y\n')
    await new Promise(r => setTimeout(r, 250))
    expect(seen.find(e => e.path.endsWith('.skip'))).toBeUndefined()
    h.close()
  })

  it('isMissingPathError recognizes ENOENT and ENOTDIR', () => {
    expect(isMissingPathError({ code: 'ENOENT' })).toBe(true)
    expect(isMissingPathError({ code: 'ENOTDIR' })).toBe(true)
    expect(isMissingPathError({ code: 'EACCES' })).toBe(false)
    expect(isMissingPathError(new Error('x'))).toBe(false)
  })

  it('getPathStats returns null for missing paths', () => {
    expect(getPathStats(join(root, 'nonexistent'))).toBeNull()
  })
})

describe('watchDirectory — v2a PR 4 Task 17 (polling fallback)', () => {
  let root: string
  beforeEach(() => {
    root = join(tmpdir(), `fulcrum-watcher-poll-${Date.now()}`)
    mkdirSync(root, { recursive: true })
  })
  afterEach(() => {
    closeWatcherSubtree(root)
    rmSync(root, { recursive: true, force: true })
  })

  it('forces polling mode when fs is detected as nfs/cifs/fuse/overlay', () => {
    const h = watchDirectory(root, { forcedFsKind: 'nfs' })
    expect(h.mode).toBe('polling')
    expect(h.fs).toBe('nfs')
    h.close()
  })

  it('uses native mode for unknown / native filesystems', () => {
    const h = watchDirectory(root, { forcedFsKind: 'native' })
    expect(h.mode).toBe('native')
    h.close()
  })
})
