import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ensure, shutdownAll, pciStatus } from '../pci/singleton.js'

describe('PCI singleton — v2a PR 4 Task 18', () => {
  let root: string
  beforeEach(() => {
    shutdownAll()
    root = join(tmpdir(), `fulcrum-pci-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(root, { recursive: true })
    process.env['FULCRUM_DATA_DIR'] = join(tmpdir(), `fulcrum-data-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  })
  afterEach(() => {
    shutdownAll()
    rmSync(root, { recursive: true, force: true })
    delete process.env['FULCRUM_DATA_DIR']
  })

  it('ensure() returns a handle for the project root', () => {
    const h = ensure(root)
    expect(h.projectRoot).toBe(root)
    expect(typeof h.realpath).toBe('string')
    expect(typeof h.stop).toBe('function')
  })

  it('two ensure() calls share refcount; stop only tears down on last release', async () => {
    const h1 = ensure(root)
    const h2 = ensure(root)
    expect(pciStatus().entries).toBe(1)

    h1.stop()
    expect(pciStatus().entries).toBe(1) // still held by h2

    h2.stop()
    // Grace period — entry stays for 30s before tear-down. Verify still present.
    expect(pciStatus().entries).toBe(1)
  })

  it('shutdownAll() cancels grace + tears everything down', () => {
    const h = ensure(root)
    h.stop()
    expect(pciStatus().entries).toBe(1) // grace
    shutdownAll()
    expect(pciStatus().entries).toBe(0)
  })

  it('pciStatus reports refcounts per realpath', () => {
    ensure(root)
    ensure(root)
    const status = pciStatus()
    expect(status.entries).toBe(1)
    const refcount = Object.values(status.refcounts)[0]
    expect(refcount).toBe(2)
  })

  it('survives a project root that does not exist (handle returned, no throw)', () => {
    const phantom = join(tmpdir(), `fulcrum-pci-phantom-${Date.now()}`)
    const h = ensure(phantom)
    expect(h.projectRoot).toBe(phantom)
    h.stop()
  })
})
