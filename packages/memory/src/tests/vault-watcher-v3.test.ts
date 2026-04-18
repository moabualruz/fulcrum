// packages/memory/src/tests/vault-watcher-v3.test.ts
//
// Memory v3 PR 1 unit 1.3 — vault watcher emits distinct `l0_raw` + `l1_curated`
// change events on the existing ContentChangeBus. Existing `memories/` behavior
// (echo suppression, onHumanEdit/onHumanDelete callbacks) is covered by
// vault-watcher.test.ts; this file asserts only the new v3 tiers.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getContentChangeBus, resetContentChangeBus, type ContentChangeEvent } from 'fulcrum-agent-core'
import { startVaultWatcher } from '../vault/watcher.js'

let tmpVault: string
let stopWatcher: (() => void) | null = null

const waitFor = <T,>(pred: () => T | null | undefined, ms = 2000): Promise<T> =>
  new Promise((resolve, reject) => {
    const start = Date.now()
    const t = setInterval(() => {
      const r = pred()
      if (r) { clearInterval(t); resolve(r) }
      else if (Date.now() - start > ms) { clearInterval(t); reject(new Error('timeout')) }
    }, 20)
  })

beforeEach(() => {
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-watcher-v3-'))
  mkdirSync(join(tmpVault, 'raw', 'bash_trace', '2026', '04', '18'), { recursive: true })
  mkdirSync(join(tmpVault, 'curated', 'pages'), { recursive: true })
  resetContentChangeBus()
})

afterEach(() => {
  if (stopWatcher) stopWatcher()
  stopWatcher = null
  rmSync(tmpVault, { recursive: true, force: true })
  resetContentChangeBus()
})

describe('vault watcher — v3 tier events', () => {
  it('emits kind=l0_raw on add under raw/', async () => {
    const captured: ContentChangeEvent[] = []
    getContentChangeBus().on((e) => { captured.push(e) })
    stopWatcher = startVaultWatcher({
      vaultPath: tmpVault,
      onHumanEdit: async () => {},
      onHumanDelete: async () => {},
    })
    // chokidar needs a tick to bind watchers before a file add fires.
    await new Promise<void>((r) => setTimeout(r, 200))
    writeFileSync(join(tmpVault, 'raw', 'bash_trace', '2026', '04', '18', 'l0src_test.md'), 'raw body\n')
    const hit = await waitFor(() => captured.find((e) => e.kind === 'l0_raw' && e.change_type === 'add'))
    expect(hit.path).toContain('raw/bash_trace/2026/04/18/l0src_test.md')
    expect(hit.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('emits kind=l1_curated on add under curated/', async () => {
    const captured: ContentChangeEvent[] = []
    getContentChangeBus().on((e) => { captured.push(e) })
    stopWatcher = startVaultWatcher({
      vaultPath: tmpVault,
      onHumanEdit: async () => {},
      onHumanDelete: async () => {},
    })
    await new Promise<void>((r) => setTimeout(r, 200))
    writeFileSync(join(tmpVault, 'curated', 'pages', 'page_01.md'), '---\nid: page_01\n---\nbody\n')
    const hit = await waitFor(() => captured.find((e) => e.kind === 'l1_curated' && e.change_type === 'add'))
    expect(hit.path).toContain('curated/pages/page_01.md')
  })

  it('emits kind=l0_raw change_type=unlink on raw/ delete', async () => {
    const target = join(tmpVault, 'raw', 'bash_trace', '2026', '04', '18', 'l0src_del.md')
    writeFileSync(target, 'body')
    stopWatcher = startVaultWatcher({
      vaultPath: tmpVault,
      onHumanEdit: async () => {},
      onHumanDelete: async () => {},
    })
    await new Promise<void>((r) => setTimeout(r, 200))
    const captured: ContentChangeEvent[] = []
    getContentChangeBus().on((e) => { captured.push(e) })
    unlinkSync(target)
    const hit = await waitFor(() => captured.find((e) => e.kind === 'l0_raw' && e.change_type === 'unlink'))
    expect(hit.sha256).toBe('')
  })

  it('does NOT invoke onHumanEdit for raw/ or curated/ changes (those are v2a-only)', async () => {
    let humanEditCount = 0
    stopWatcher = startVaultWatcher({
      vaultPath: tmpVault,
      onHumanEdit: async () => { humanEditCount++ },
      onHumanDelete: async () => {},
    })
    await new Promise<void>((r) => setTimeout(r, 200))
    writeFileSync(join(tmpVault, 'raw', 'bash_trace', '2026', '04', '18', 'l0src_a.md'), 'body')
    writeFileSync(join(tmpVault, 'curated', 'pages', 'page_a.md'), 'body')
    // Give chokidar + the awaitWriteFinish window time to stabilize.
    await new Promise<void>((r) => setTimeout(r, 600))
    expect(humanEditCount).toBe(0)
  })
})
