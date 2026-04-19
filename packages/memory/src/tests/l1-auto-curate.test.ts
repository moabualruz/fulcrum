// packages/memory/src/tests/l1-auto-curate.test.ts
//
// Memory v3 PR 8 unit 8.1 — auto-curator subscribes to the vault-watcher's
// ContentChangeBus and, when FULCRUM_MEMORY_CURATE_AUTO=1, fires the curator
// on each new L0 file after a 30s debounce. Tests use an injected bus + fake
// scheduler so the suite runs synchronously.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { ContentChangeBus, ContentChangeEvent, ContentChangeHandler } from 'fulcrum-agent-core'
import { startAutoCurator, type AutoCurateScheduler } from '../l1/auto-curate.js'

// ── Test harness ──────────────────────────────────────────────────────────

function makeFakeBus(): ContentChangeBus & { fire: (evt: Omit<ContentChangeEvent, 'ts'>) => void } {
  const handlers = new Set<ContentChangeHandler>()
  return {
    on(h) { handlers.add(h) },
    off(h) { handlers.delete(h) },
    emit(evt) { fire(evt) },
    listenerCount() { return handlers.size },
    fire(evt) { fire(evt) },
  }
  function fire(evt: Omit<ContentChangeEvent, 'ts'>): void {
    const full: ContentChangeEvent = { ...evt, ts: new Date().toISOString() }
    for (const h of handlers) { try { void h(full) } catch { /* swallow */ } }
  }
}

function makeFakeScheduler(): AutoCurateScheduler & { advance: (ms: number) => Promise<void> } {
  type Pending = { handle: number; fn: () => void; fireAt: number }
  let now = 0
  let nextHandle = 1
  const queue: Pending[] = []
  return {
    setTimeout(fn, ms): number {
      const h = nextHandle++
      queue.push({ handle: h, fn, fireAt: now + ms })
      return h
    },
    clearTimeout(handle) {
      const i = queue.findIndex((p) => p.handle === handle)
      if (i >= 0) queue.splice(i, 1)
    },
    async advance(ms) {
      now += ms
      const due = queue.filter((p) => p.fireAt <= now).sort((a, b) => a.fireAt - b.fireAt)
      for (const p of due) {
        queue.splice(queue.indexOf(p), 1)
        p.fn()
      }
      // Let any microtasks queued by the timer callbacks drain.
      await Promise.resolve()
      await Promise.resolve()
    },
  }
}

const PATH = (name: string, type = 'bash_trace'): string =>
  `/tmp/fake-vault/raw/${type}/2026/04/18/${name}.md`

const ULID = '01KPGHE0123456789ABCDEFGHJ'

let origEnv: string | undefined

beforeEach(() => {
  origEnv = process.env['FULCRUM_MEMORY_CURATE_AUTO']
  delete process.env['FULCRUM_MEMORY_CURATE_AUTO']
})
afterEach(() => {
  if (origEnv === undefined) delete process.env['FULCRUM_MEMORY_CURATE_AUTO']
  else process.env['FULCRUM_MEMORY_CURATE_AUTO'] = origEnv
})

// ── Tests ─────────────────────────────────────────────────────────────────

describe('startAutoCurator — enablement', () => {
  it('returns a no-op stop when FULCRUM_MEMORY_CURATE_AUTO is unset', () => {
    const bus = makeFakeBus()
    let called = 0
    const stop = startAutoCurator({ bus, curate: async () => { called++ } })
    expect(bus.listenerCount()).toBe(0)
    bus.fire({ kind: 'l0_raw', change_type: 'add', path: PATH(`l0src_${ULID}`), sha256: 'a' })
    expect(called).toBe(0)
    stop()
  })

  it('subscribes when enabled=true', () => {
    const bus = makeFakeBus()
    const stop = startAutoCurator({ bus, enabled: true, curate: async () => {} })
    expect(bus.listenerCount()).toBe(1)
    stop()
    expect(bus.listenerCount()).toBe(0)
  })

  it('subscribes when env FULCRUM_MEMORY_CURATE_AUTO=1 (no explicit enabled)', () => {
    process.env['FULCRUM_MEMORY_CURATE_AUTO'] = '1'
    const bus = makeFakeBus()
    const stop = startAutoCurator({ bus, curate: async () => {} })
    expect(bus.listenerCount()).toBe(1)
    stop()
  })

  it('does NOT subscribe when env is set to 0 even if explicit enabled=false', () => {
    process.env['FULCRUM_MEMORY_CURATE_AUTO'] = '1'
    const bus = makeFakeBus()
    const stop = startAutoCurator({ bus, enabled: false, curate: async () => {} })
    expect(bus.listenerCount()).toBe(0)
    stop()
  })
})

describe('startAutoCurator — event routing', () => {
  it('fires curate on l0_raw add after the debounce elapses', async () => {
    const bus = makeFakeBus()
    const sched = makeFakeScheduler()
    const calls: string[] = []
    const stop = startAutoCurator({
      bus, enabled: true, scheduler: sched,
      curate: async (id) => { calls.push(id) },
    })

    bus.fire({ kind: 'l0_raw', change_type: 'add', path: PATH(`l0src_${ULID}`), sha256: 'a' })
    expect(calls).toEqual([])
    await sched.advance(29_000)
    expect(calls).toEqual([])
    await sched.advance(1_000)
    expect(calls).toEqual([`l0src_${ULID}`])

    stop()
  })

  it('ignores kind=l1_curated', async () => {
    const bus = makeFakeBus()
    const sched = makeFakeScheduler()
    let called = 0
    const stop = startAutoCurator({
      bus, enabled: true, scheduler: sched,
      curate: async () => { called++ },
    })
    bus.fire({ kind: 'l1_curated', change_type: 'add', path: '/v/curated/pages/page_a.md', sha256: 'a' })
    await sched.advance(60_000)
    expect(called).toBe(0)
    stop()
  })

  it('ignores kind=memory (v2a)', async () => {
    const bus = makeFakeBus()
    const sched = makeFakeScheduler()
    let called = 0
    const stop = startAutoCurator({
      bus, enabled: true, scheduler: sched,
      curate: async () => { called++ },
    })
    bus.fire({ kind: 'memory', change_type: 'change', path: '/v/memories/a.md', sha256: 'a' })
    await sched.advance(60_000)
    expect(called).toBe(0)
    stop()
  })

  it('ignores change_type=change on l0_raw (L0 is immutable)', async () => {
    const bus = makeFakeBus()
    const sched = makeFakeScheduler()
    let called = 0
    const stop = startAutoCurator({
      bus, enabled: true, scheduler: sched,
      curate: async () => { called++ },
    })
    bus.fire({ kind: 'l0_raw', change_type: 'change', path: PATH(`l0src_${ULID}`), sha256: 'a' })
    await sched.advance(60_000)
    expect(called).toBe(0)
    stop()
  })

  it('ignores change_type=unlink on l0_raw', async () => {
    const bus = makeFakeBus()
    const sched = makeFakeScheduler()
    let called = 0
    const stop = startAutoCurator({
      bus, enabled: true, scheduler: sched,
      curate: async () => { called++ },
    })
    bus.fire({ kind: 'l0_raw', change_type: 'unlink', path: PATH(`l0src_${ULID}`), sha256: '' })
    await sched.advance(60_000)
    expect(called).toBe(0)
    stop()
  })

  it('ignores non-l0src_ basenames', async () => {
    const bus = makeFakeBus()
    const sched = makeFakeScheduler()
    let called = 0
    const stop = startAutoCurator({
      bus, enabled: true, scheduler: sched,
      curate: async () => { called++ },
    })
    bus.fire({ kind: 'l0_raw', change_type: 'add', path: PATH('not_an_l0_id'), sha256: 'a' })
    bus.fire({ kind: 'l0_raw', change_type: 'add', path: '/v/raw/bash_trace/2026/04/18/README.md', sha256: 'a' })
    bus.fire({ kind: 'l0_raw', change_type: 'add', path: '/v/raw/no-ext', sha256: 'a' })
    await sched.advance(60_000)
    expect(called).toBe(0)
    stop()
  })
})

describe('startAutoCurator — debounce', () => {
  it('coalesces multiple adds for the same l0_id within the debounce window', async () => {
    const bus = makeFakeBus()
    const sched = makeFakeScheduler()
    const calls: string[] = []
    const stop = startAutoCurator({
      bus, enabled: true, scheduler: sched, debounceMs: 30_000,
      curate: async (id) => { calls.push(id) },
    })

    const path = PATH(`l0src_${ULID}`)
    bus.fire({ kind: 'l0_raw', change_type: 'add', path, sha256: 'v1' })
    await sched.advance(15_000)
    bus.fire({ kind: 'l0_raw', change_type: 'add', path, sha256: 'v2' })
    await sched.advance(15_000)
    expect(calls).toEqual([]) // timer reset on the second event
    await sched.advance(15_000)
    expect(calls).toEqual([`l0src_${ULID}`])

    stop()
  })

  it('schedules independent timers for different l0_ids', async () => {
    const bus = makeFakeBus()
    const sched = makeFakeScheduler()
    const calls: string[] = []
    const stop = startAutoCurator({
      bus, enabled: true, scheduler: sched,
      curate: async (id) => { calls.push(id) },
    })
    const idA = '01KPGH000000000000000000AA'
    const idB = '01KPGH000000000000000000BB'
    bus.fire({ kind: 'l0_raw', change_type: 'add', path: PATH(`l0src_${idA}`), sha256: 'a' })
    bus.fire({ kind: 'l0_raw', change_type: 'add', path: PATH(`l0src_${idB}`), sha256: 'b' })
    await sched.advance(30_000)
    expect(calls.sort()).toEqual([`l0src_${idA}`, `l0src_${idB}`])
    stop()
  })

  it('honors a custom debounceMs', async () => {
    const bus = makeFakeBus()
    const sched = makeFakeScheduler()
    const calls: string[] = []
    const stop = startAutoCurator({
      bus, enabled: true, scheduler: sched, debounceMs: 500,
      curate: async (id) => { calls.push(id) },
    })
    bus.fire({ kind: 'l0_raw', change_type: 'add', path: PATH(`l0src_${ULID}`), sha256: 'a' })
    await sched.advance(499)
    expect(calls).toEqual([])
    await sched.advance(1)
    expect(calls).toEqual([`l0src_${ULID}`])
    stop()
  })
})

describe('startAutoCurator — teardown + errors', () => {
  it('stop() removes the bus listener and clears pending timers', async () => {
    const bus = makeFakeBus()
    const sched = makeFakeScheduler()
    let called = 0
    const stop = startAutoCurator({
      bus, enabled: true, scheduler: sched,
      curate: async () => { called++ },
    })
    bus.fire({ kind: 'l0_raw', change_type: 'add', path: PATH(`l0src_${ULID}`), sha256: 'a' })
    stop()
    expect(bus.listenerCount()).toBe(0)
    await sched.advance(60_000)
    expect(called).toBe(0)
  })

  it('onError is invoked when curate throws; other pending timers still fire', async () => {
    const bus = makeFakeBus()
    const sched = makeFakeScheduler()
    const errs: Array<{ l0_id: string; msg: string }> = []
    const calls: string[] = []
    const stop = startAutoCurator({
      bus, enabled: true, scheduler: sched,
      curate: async (id) => {
        if (id.endsWith('AA')) throw new Error('boom')
        calls.push(id)
      },
      onError: (err, id) => { errs.push({ l0_id: id, msg: err.message }) },
    })
    const idA = '01KPGH000000000000000000AA'
    const idB = '01KPGH000000000000000000BB'
    bus.fire({ kind: 'l0_raw', change_type: 'add', path: PATH(`l0src_${idA}`), sha256: 'a' })
    bus.fire({ kind: 'l0_raw', change_type: 'add', path: PATH(`l0src_${idB}`), sha256: 'b' })
    await sched.advance(30_000)
    // Drain the async microtask queue so the catch path runs.
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(calls).toEqual([`l0src_${idB}`])
    expect(errs.length).toBe(1)
    expect(errs[0]?.l0_id).toBe(`l0src_${idA}`)
    expect(errs[0]?.msg).toBe('boom')
    stop()
  })
})
