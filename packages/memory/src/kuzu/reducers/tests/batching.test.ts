// v2b PR 10 Task 1.6 — reducer dispatcher batching + backpressure tests.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createReducerDispatcher, type ReducerDispatcher } from '../dispatcher.js'
import { clearGraphReducers, registerGraphReducer } from '../index.js'

// Helper: build a minimal event
function makeEvent(type: 'task_created' | 'memory_written' | 'agent_run_finished' = 'task_created') {
  return {
    workspace_id: 'w1',
    project_id: 'p1',
    evt_type: type,
    actor_type: 'agent',
    actor_id: 'a1',
    ts: new Date().toISOString(),
    object_type: 'task',
    object_id: 't1',
  }
}

describe('reducer dispatcher batching — v2b PR 10 Task 1.6', () => {
  let dispatcher: ReducerDispatcher

  beforeEach(() => {
    clearGraphReducers()
    dispatcher = createReducerDispatcher({ batchSize: 10, flushIntervalMs: 50 })
  })

  afterEach(() => {
    dispatcher.stop()
  })

  it('enqueue() does not call reducer immediately (buffered)', () => {
    const fn = vi.fn()
    registerGraphReducer('task_created', fn)
    dispatcher.enqueue(makeEvent())
    // fn called synchronously before flush = buffered
    expect(fn).not.toHaveBeenCalled()
  })

  it('flush() drains the buffer and dispatches all events', () => {
    const fn = vi.fn()
    registerGraphReducer('task_created', fn)
    for (let i = 0; i < 5; i++) dispatcher.enqueue(makeEvent())
    dispatcher.flush()
    expect(fn).toHaveBeenCalledTimes(5)
  })

  it('auto-flushes when batchSize is reached', () => {
    const fn = vi.fn()
    registerGraphReducer('task_created', fn)
    for (let i = 0; i < 10; i++) dispatcher.enqueue(makeEvent())
    // batchSize=10 → flush triggered synchronously within enqueue
    expect(fn).toHaveBeenCalledTimes(10)
  })

  it('logs reducer_lag warning when Kuzu stub delays beyond lag threshold', async () => {
    // TEST-A: deterministic lag test. Use a long-enough sleep vs threshold so
    // the warning path is guaranteed to fire; assert the warning text contains
    // 'reducer_lag'. The prior test could never fail (only asserted slowFn was
    // called) — that is strictly weaker than the behaviour the plan promised.
    const warnings: string[] = []
    // The dispatcher measures elapsed time around a sync call (no await), so
    // a truly sync-slow reducer is the only way to trigger the lag path.
    // Busy-loop for 50 ms.
    const slowFn = vi.fn().mockImplementation(() => {
      const deadline = Date.now() + 50
      while (Date.now() < deadline) { /* spin */ }
    })
    registerGraphReducer('memory_written', slowFn)
    const origWarn = console.warn
    console.warn = (msg: unknown) => warnings.push(String(msg))
    const disp = createReducerDispatcher({ batchSize: 2, flushIntervalMs: 5, lagThresholdMs: 10 })
    disp.enqueue(makeEvent('memory_written'))
    disp.enqueue(makeEvent('memory_written'))
    // Wait long enough for the slow reducer to exceed the lag threshold.
    await new Promise(r => setTimeout(r, 150))
    console.warn = origWarn
    disp.stop()
    expect(slowFn).toHaveBeenCalled()
    expect(warnings.some(w => w.includes('reducer_lag'))).toBe(true)
  })

  it('overflow: drops oldest event and emits reducer_overflow error when buffer > maxBuffer', () => {
    const errors: string[] = []
    const origError = console.error
    console.error = (msg: unknown) => errors.push(String(msg))

    const fn = vi.fn()
    registerGraphReducer('task_created', fn)
    // maxBuffer defaults to 1024; use a dispatcher with tiny maxBuffer to force overflow
    const tinyDisp = createReducerDispatcher({ batchSize: 100, flushIntervalMs: 60000, maxBuffer: 3 })
    for (let i = 0; i < 5; i++) tinyDisp.enqueue(makeEvent())

    console.error = origError
    tinyDisp.stop()

    // Buffer was capped at 3; overflow entries emitted error log
    expect(errors.some(e => e.includes('reducer_overflow'))).toBe(true)
  })
})
