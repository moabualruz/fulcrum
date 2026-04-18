// Regression guard for the "watcher has no producer" bug fixed in the
// indexer-daemon end-to-end pass.
//
// Before the fix, DaemonRegistry.ensureWatching called startPciSyncer (a bus
// SUBSCRIBER) without ever mounting the fs.watch PRODUCER. As a result, the
// bus had subscribers but no publishers and code_files stayed empty forever.
// These tests exercise the real startProjectWatch on a temp directory and
// assert that fs events actually flow onto the content-change bus.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startProjectWatch, closeWatcherSubtree } from '../watcher.js'
import { getContentChangeBus, type ContentChangeEvent } from 'fulcrum-agent-core'

describe('startProjectWatch — producer wiring', () => {
  let root: string
  let seen: ContentChangeEvent[]
  let off: (() => void) | null = null

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'fulcrum-pw-'))
    seen = []
    const handler = (evt: ContentChangeEvent): void => { seen.push(evt) }
    getContentChangeBus().on(handler)
    off = () => getContentChangeBus().off(handler)
  })

  afterEach(() => {
    off?.()
    try { closeWatcherSubtree(root) } catch { /* ok */ }
    try { rmSync(root, { recursive: true, force: true }) } catch { /* ok */ }
  })

  it('emits a code-kind bus event when a new file appears at the root', async () => {
    const handle = startProjectWatch(root)
    try {
      // Allow the watcher to settle (fs.watch is async-register on Linux).
      await new Promise((r) => setTimeout(r, 50))
      writeFileSync(join(root, 'a.ts'), 'export const x = 1\n')
      // Poll up to 1s for the event (inotify can take a few tens of ms).
      for (let i = 0; i < 20 && seen.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 50))
      }
      const codeEvents = seen.filter((e) => e.kind === 'code')
      expect(codeEvents.length, 'at least one code-kind event expected').toBeGreaterThan(0)
      const match = codeEvents.find((e) => e.path.endsWith('a.ts'))
      expect(match).toBeDefined()
    } finally {
      handle.close()
    }
  })

  it('emits a code-kind bus event for a file inside a subdirectory mounted at start', async () => {
    const sub = join(root, 'deep', 'nest')
    mkdirSync(sub, { recursive: true })
    const handle = startProjectWatch(root)
    try {
      await new Promise((r) => setTimeout(r, 50))
      writeFileSync(join(sub, 'b.ts'), 'export const y = 2\n')
      for (let i = 0; i < 20 && !seen.some((e) => e.path.endsWith('b.ts')); i++) {
        await new Promise((r) => setTimeout(r, 50))
      }
      const match = seen.find((e) => e.kind === 'code' && e.path.endsWith('b.ts'))
      expect(match, 'event for nested file must fire').toBeDefined()
    } finally {
      handle.close()
    }
  })

  it('does not mount watchers on excluded dirs (node_modules)', async () => {
    const excluded = join(root, 'node_modules', 'some-pkg')
    mkdirSync(excluded, { recursive: true })
    const handle = startProjectWatch(root)
    try {
      // watchedDirs snapshot should NOT include any path containing node_modules.
      expect(
        [...handle.watchedDirs].some((d) => d.includes('node_modules')),
        'node_modules must not be mounted',
      ).toBe(false)
    } finally {
      handle.close()
    }
  })

  it('close() tears down all mounted watchers', async () => {
    const handle = startProjectWatch(root)
    expect(handle.watchedDirs.size).toBeGreaterThanOrEqual(1)
    handle.close()
    // After close, writing a file should produce NO events.
    seen.length = 0
    writeFileSync(join(root, 'after-close.ts'), 'export const z = 3\n')
    await new Promise((r) => setTimeout(r, 150))
    const codeEvents = seen.filter((e) => e.kind === 'code')
    expect(codeEvents, 'no events after close').toHaveLength(0)
  })
})
