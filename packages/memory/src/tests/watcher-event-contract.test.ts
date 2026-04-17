import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getContentChangeBus, resetContentChangeBus, type ContentChangeEvent } from 'fulcrum-agent-core'

describe('ContentChangeBus — v2a PR 4 Task 22a', () => {
  beforeEach(() => resetContentChangeBus())
  afterEach(() => resetContentChangeBus())

  it('debounces two events on the same path within 100ms into one', async () => {
    const bus = getContentChangeBus()
    const seen: ContentChangeEvent[] = []
    bus.on(evt => { seen.push(evt) })

    bus.emit({ kind: 'code', path: '/p/a.ts', sha256: 'h1', change_type: 'change' })
    bus.emit({ kind: 'code', path: '/p/a.ts', sha256: 'h2', change_type: 'change' })

    await new Promise(r => setTimeout(r, 200))
    expect(seen).toHaveLength(1)
    expect(seen[0]!.sha256).toBe('h2') // last-write-wins coalesce
  })

  it('does not coalesce events for different paths', async () => {
    const bus = getContentChangeBus()
    const seen: ContentChangeEvent[] = []
    bus.on(evt => { seen.push(evt) })

    bus.emit({ kind: 'code', path: '/p/a.ts', sha256: 'h1', change_type: 'change' })
    bus.emit({ kind: 'code', path: '/p/b.ts', sha256: 'h2', change_type: 'change' })

    await new Promise(r => setTimeout(r, 200))
    expect(seen).toHaveLength(2)
  })

  it('does not coalesce events on different kinds (memory vs code)', async () => {
    const bus = getContentChangeBus()
    const seen: ContentChangeEvent[] = []
    bus.on(evt => { seen.push(evt) })

    bus.emit({ kind: 'code', path: '/p/x', sha256: 'h1', change_type: 'change' })
    bus.emit({ kind: 'memory', path: '/p/x', sha256: 'h2', change_type: 'change' })

    await new Promise(r => setTimeout(r, 200))
    expect(seen).toHaveLength(2)
  })

  it('emits ts (ISO 8601) at fire time', async () => {
    const bus = getContentChangeBus()
    const seen: ContentChangeEvent[] = []
    bus.on(evt => { seen.push(evt) })

    bus.emit({ kind: 'code', path: '/p/a', sha256: 'h', change_type: 'add' })
    await new Promise(r => setTimeout(r, 150))
    expect(seen[0]!.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('off() removes the handler', async () => {
    const bus = getContentChangeBus()
    const seen: ContentChangeEvent[] = []
    const h = (evt: ContentChangeEvent) => { seen.push(evt) }
    bus.on(h)
    bus.off(h)
    bus.emit({ kind: 'code', path: '/p/a', sha256: 'h', change_type: 'change' })
    await new Promise(r => setTimeout(r, 150))
    expect(seen).toHaveLength(0)
  })

  it('handler exception does not crash the bus', async () => {
    const bus = getContentChangeBus()
    const seen: ContentChangeEvent[] = []
    bus.on(() => { throw new Error('crash') })
    bus.on(evt => { seen.push(evt) })
    bus.emit({ kind: 'code', path: '/p/a', sha256: 'h', change_type: 'change' })
    await new Promise(r => setTimeout(r, 150))
    expect(seen).toHaveLength(1)
  })
})
