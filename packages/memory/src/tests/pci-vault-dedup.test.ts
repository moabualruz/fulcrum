// v2a PR 4 Task 22 — vault/PCI dedup tests.
//
// The vault watcher owns {globalDataDir()}/memory/. PCI refuses to attach to
// any directory at or under that prefix. Both emit ContentChangeEvent on the
// unified bus with disjoint kind tags (memory vs code) so v2b consumers don't
// have to branch per-watcher.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resetContentChangeBus, getContentChangeBus, globalDataDir } from '@moabualruz/fulcrum-core'
import { ensure, shutdownAll, isVaultOwnedPath, VaultOwnedPathError } from '../pci/singleton.js'

describe('PCI vault-dedup guard — v2a PR 4 Task 22', () => {
  let dataDir: string
  beforeEach(() => {
    dataDir = join(tmpdir(), `fulcrum-vault-dedup-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(join(dataDir, 'memory'), { recursive: true })
    process.env['FULCRUM_DATA_DIR'] = dataDir
    resetContentChangeBus()
    shutdownAll()
  })
  afterEach(() => {
    shutdownAll()
    rmSync(dataDir, { recursive: true, force: true })
    delete process.env['FULCRUM_DATA_DIR']
  })

  it('isVaultOwnedPath returns true for vault root + descendants', () => {
    expect(isVaultOwnedPath(join(globalDataDir(), 'memory'))).toBe(true)
    expect(isVaultOwnedPath(join(globalDataDir(), 'memory', 'memories', 'a.md'))).toBe(true)
    expect(isVaultOwnedPath(join(globalDataDir(), 'pci'))).toBe(false)
    expect(isVaultOwnedPath('/tmp/anywhere-else')).toBe(false)
  })

  it('ensure() throws VaultOwnedPathError for vault root', () => {
    const vaultRoot = join(globalDataDir(), 'memory')
    expect(() => ensure(vaultRoot)).toThrow(VaultOwnedPathError)
  })

  it('ensure() throws VaultOwnedPathError for vault subdirectory', () => {
    const sub = join(globalDataDir(), 'memory', 'memories')
    mkdirSync(sub, { recursive: true })
    expect(() => ensure(sub)).toThrow(VaultOwnedPathError)
  })

  it('ensure() succeeds for non-vault paths', () => {
    const notVault = join(tmpdir(), `fulcrum-code-proj-${Date.now()}`)
    mkdirSync(notVault, { recursive: true })
    try {
      const handle = ensure(notVault)
      expect(handle.projectRoot).toBe(notVault)
    } finally {
      rmSync(notVault, { recursive: true, force: true })
    }
  })

  it('bus events from vault vs PCI carry disjoint kind tags', async () => {
    // Verify the unified bus routes memory+code kinds without mixing them.
    // (Integration test of the contract documented in Task 22a.)
    const bus = getContentChangeBus()
    const received: Array<{ kind: string; path: string }> = []
    const handler = (evt: { kind: string; path: string }): void => { received.push(evt) }
    bus.on(handler)

    bus.emit({ kind: 'memory', path: '/tmp/m.md', sha256: 'abc', change_type: 'change' })
    bus.emit({ kind: 'code',   path: '/tmp/c.ts', sha256: 'def', change_type: 'change' })

    // Debounce window is 100ms.
    await new Promise(resolve => setTimeout(resolve, 150))
    bus.off(handler)

    const memoryEvents = received.filter(e => e.kind === 'memory')
    const codeEvents = received.filter(e => e.kind === 'code')
    expect(memoryEvents.length).toBe(1)
    expect(codeEvents.length).toBe(1)
    // Disjoint paths per kind.
    expect(memoryEvents[0]!.path).toBe('/tmp/m.md')
    expect(codeEvents[0]!.path).toBe('/tmp/c.ts')
  })
})
