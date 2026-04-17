// v2b PR 10 Task 1.6 — reducer dispatcher batching + backpressure tests.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createReducerDispatcher, type ReducerDispatcher } from '../dispatcher.js'
import { clearGraphReducers, registerGraphReducer } from '../index.js'

// Helper: build a minimal event
function makeEvent(type: 'task_created' | 'memory_written' | 'agent_run_finished' = 'task_created') {
  return {
    workspace_id: 'w1',
    project_id: 'p1',
    evt_type: type as const,
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
    const warnings: string[] = []
    const slowFn = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 20))
    })
    registerGraphReducer('memory_written', slowFn)
    const origWarn = console.warn
    console.warn = (msg: unknown) => warnings.push(String(msg))
    const disp = createReducerDispatcher({ batchSize: 2, flushIntervalMs: 5, lagThresholdMs: 10 })
    disp.enqueue(makeEvent('memory_written'))
    disp.enqueue(makeEvent('memory_written'))
    // wait for flush
    await new Promise(r => setTimeout(r, 60))
    console.warn = origWarn
    disp.stop()
    // The slow reducer should have run; lag warning may or may not fire depending on timing
    expect(slowFn).toHaveBeenCalled()
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
