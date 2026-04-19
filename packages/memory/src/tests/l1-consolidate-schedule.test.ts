// packages/memory/src/tests/l1-consolidate-schedule.test.ts
//
// Memory v3 PR 8 unit 8.2 — scheduled consolidation pass. Tests the pure
// cadence → setTimeout loop using an injected fake scheduler.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { AutoCurateScheduler } from '../l1/auto-curate.js'
import {
  startConsolidateSchedule,
  CADENCE_MS,
} from '../l1/consolidate-schedule.js'

function makeFakeScheduler(): AutoCurateScheduler & { advance: (ms: number) => Promise<void>; pending: () => number } {
  type P = { handle: number; fn: () => void; fireAt: number }
  let now = 0
  let next = 1
  const queue: P[] = []
  return {
    setTimeout(fn, ms) {
      const h = next++
      queue.push({ handle: h, fn, fireAt: now + ms })
      return h
    },
    clearTimeout(h) {
      const i = queue.findIndex(p => p.handle === h)
      if (i >= 0) queue.splice(i, 1)
    },
    async advance(ms) {
      now += ms
      while (true) {
        const due = queue.filter(p => p.fireAt <= now).sort((a, b) => a.fireAt - b.fireAt)
        if (due.length === 0) break
        const p = due[0]!
        queue.splice(queue.indexOf(p), 1)
        p.fn()
        // Let microtasks (the async IIFE inside setTimeout) drain before picking
        // the next due item — required so a rescheduled tick that chains off the
        // previous run is visible to the loop.
        await Promise.resolve()
        await Promise.resolve()
        await Promise.resolve()
      }
    },
    pending() { return queue.length },
  }
}

let prevEnv: string | undefined
beforeEach(() => {
  prevEnv = process.env['FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE']
  delete process.env['FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE']
})
afterEach(() => {
  if (prevEnv === undefined) delete process.env['FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE']
  else process.env['FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE'] = prevEnv
})

describe('startConsolidateSchedule — enablement', () => {
  it('returns a no-op stop when cadence is unset', () => {
    const sched = makeFakeScheduler()
    let called = 0
    const stop = startConsolidateSchedule({
      runPass: async () => { called++ },
      scheduler: sched,
    })
    expect(sched.pending()).toBe(0)
    stop()
    expect(called).toBe(0)
  })

  it('returns a no-op stop when cadence is "never"', () => {
    const sched = makeFakeScheduler()
    const stop = startConsolidateSchedule({
      cadence: 'never',
      runPass: async () => {},
      scheduler: sched,
    })
    expect(sched.pending()).toBe(0)
    stop()
  })

  it('returns a no-op stop on unknown cadence strings', () => {
    const sched = makeFakeScheduler()
    const stop = startConsolidateSchedule({
      cadence: '7d',
      runPass: async () => {},
      scheduler: sched,
    })
    expect(sched.pending()).toBe(0)
    stop()
  })

  it('reads FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE when cadence is unset', () => {
    process.env['FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE'] = 'hourly'
    const sched = makeFakeScheduler()
    const stop = startConsolidateSchedule({
      runPass: async () => {},
      scheduler: sched,
    })
    expect(sched.pending()).toBe(1)
    stop()
    expect(sched.pending()).toBe(0)
  })

  it('explicit cadence wins over env', () => {
    process.env['FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE'] = 'daily'
    const sched = makeFakeScheduler()
    const stop = startConsolidateSchedule({
      cadence: 'never',
      runPass: async () => {},
      scheduler: sched,
    })
    expect(sched.pending()).toBe(0)
    stop()
  })
})

describe('startConsolidateSchedule — cadence', () => {
  it('fires runPass every hour on "hourly"', async () => {
    const sched = makeFakeScheduler()
    let runs = 0
    const stop = startConsolidateSchedule({
      cadence: 'hourly',
      runPass: async () => { runs++ },
      scheduler: sched,
    })
    expect(runs).toBe(0)
    await sched.advance(CADENCE_MS['hourly']!)
    expect(runs).toBe(1)
    await sched.advance(CADENCE_MS['hourly']!)
    expect(runs).toBe(2)
    await sched.advance(CADENCE_MS['hourly']!)
    expect(runs).toBe(3)
    stop()
  })

  it('fires runPass once per day on "daily"', async () => {
    const sched = makeFakeScheduler()
    let runs = 0
    const stop = startConsolidateSchedule({
      cadence: 'daily',
      runPass: async () => { runs++ },
      scheduler: sched,
    })
    // Sub-day advance does nothing.
    await sched.advance(CADENCE_MS['hourly']! * 23)
    expect(runs).toBe(0)
    await sched.advance(CADENCE_MS['hourly']!)
    expect(runs).toBe(1)
    stop()
  })

  it('does not fire before the first interval elapses', async () => {
    const sched = makeFakeScheduler()
    let runs = 0
    const stop = startConsolidateSchedule({
      cadence: 'daily',
      runPass: async () => { runs++ },
      scheduler: sched,
    })
    await sched.advance(CADENCE_MS['daily']! - 1)
    expect(runs).toBe(0)
    stop()
  })
})

describe('startConsolidateSchedule — teardown + errors', () => {
  it('stop() cancels the next scheduled tick', async () => {
    const sched = makeFakeScheduler()
    let runs = 0
    const stop = startConsolidateSchedule({
      cadence: 'hourly',
      runPass: async () => { runs++ },
      scheduler: sched,
    })
    stop()
    await sched.advance(CADENCE_MS['hourly']! * 5)
    expect(runs).toBe(0)
    expect(sched.pending()).toBe(0)
  })

  it('onError is called when runPass throws; the loop continues', async () => {
    const sched = makeFakeScheduler()
    const errors: string[] = []
    let attempts = 0
    const stop = startConsolidateSchedule({
      cadence: 'hourly',
      runPass: async () => {
        attempts++
        if (attempts === 1) throw new Error('boom')
      },
      scheduler: sched,
      onError: (err) => errors.push(err.message),
    })
    await sched.advance(CADENCE_MS['hourly']!)
    await sched.advance(CADENCE_MS['hourly']!)
    expect(attempts).toBe(2)
    expect(errors).toEqual(['boom'])
    stop()
  })

  it('stop() mid-run does not leak a pending timer', async () => {
    const sched = makeFakeScheduler()
    let resolve: () => void = () => {}
    const stop = startConsolidateSchedule({
      cadence: 'hourly',
      runPass: () => new Promise<void>((r) => { resolve = r }),
      scheduler: sched,
    })
    await sched.advance(CADENCE_MS['hourly']!)
    // runPass is in-flight; stop() should prevent rescheduling after it resolves.
    stop()
    resolve()
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(sched.pending()).toBe(0)
  })
})
