import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, unlinkSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getContentChangeBus, type ContentChangeEvent } from 'fulcrum-core'
import { pollingRescan } from '../pci/watcher.js'

// Bus debounces by 100ms — tests must await at least that long after triggering
// a rescan before inspecting the collected events.
const DEBOUNCE_WAIT = 150

describe('pollingRescan', () => {
  let dir: string
  let events: Array<{ path: string; change_type: string }>
  let handler: (e: ContentChangeEvent) => void

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fulcrum-poll-'))
    events = []
    handler = (e) => { events.push({ path: e.path, change_type: e.change_type }) }
    getContentChangeBus().on(handler)
  })

  afterEach(() => {
    getContentChangeBus().off(handler)
    rmSync(dir, { recursive: true, force: true })
  })

  it('no events on a stable directory across ticks', async () => {
    writeFileSync(join(dir, 'a.ts'), 'one')
    pollingRescan(dir)
    await new Promise(r => setTimeout(r, DEBOUNCE_WAIT))
    const firstCount = events.length
    pollingRescan(dir)
    await new Promise(r => setTimeout(r, DEBOUNCE_WAIT))
    expect(events.length).toBe(firstCount)
  })

  it('emits change on mtime/size mutation', async () => {
    writeFileSync(join(dir, 'b.ts'), 'one')
    pollingRescan(dir) // prime
    await new Promise(r => setTimeout(r, DEBOUNCE_WAIT))

    const eventsBefore = events.length
    await new Promise(r => setTimeout(r, 20))
    writeFileSync(join(dir, 'b.ts'), 'a much longer payload to bump mtime + size')
    const now = Date.now() / 1000
    utimesSync(join(dir, 'b.ts'), now + 5, now + 5)

    pollingRescan(dir)
    await new Promise(r => setTimeout(r, DEBOUNCE_WAIT))
    const delta = events.slice(eventsBefore)
    expect(delta.some(e => e.path.endsWith('b.ts') && e.change_type === 'change')).toBe(true)
  })

  it('emits unlink when a previously-seen file disappears', async () => {
    writeFileSync(join(dir, 'c.ts'), 'one')
    pollingRescan(dir)
    await new Promise(r => setTimeout(r, DEBOUNCE_WAIT))
    unlinkSync(join(dir, 'c.ts'))
    const eventsBefore = events.length
    pollingRescan(dir)
    await new Promise(r => setTimeout(r, DEBOUNCE_WAIT))
    const delta = events.slice(eventsBefore)
    expect(delta.some(e => e.path.endsWith('c.ts') && e.change_type === 'unlink')).toBe(true)
  })
})
