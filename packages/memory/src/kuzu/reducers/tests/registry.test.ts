// v2b PR 10 Task 1.5 — graph reducer registry tests.
// Asserts: planted error in one reducer does not affect other reducers;
// each reducer is called for its event type; reducer_error log emitted.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { registerGraphReducer, clearGraphReducers, dispatchToGraphReducers } from '../index.js'

describe('graph reducer registry — v2b PR 10 Task 1.5', () => {
  beforeEach(() => {
    clearGraphReducers()
  })

  it('registerGraphReducer registers a reducer for an event type', () => {
    const fn = vi.fn()
    registerGraphReducer('task_created', fn)
    const evt = { workspace_id: 'w1', project_id: 'p1', evt_type: 'task_created' as const, actor_type: 'agent', actor_id: 'a1', ts: new Date().toISOString(), object_type: 'task', object_id: 't1' }
    dispatchToGraphReducers(evt)
    expect(fn).toHaveBeenCalledOnce()
  })

  it('reducer for a different event type is NOT called', () => {
    const fn = vi.fn()
    registerGraphReducer('task_created', fn)
    const evt = { workspace_id: 'w1', project_id: 'p1', evt_type: 'agent_run_created' as const, actor_type: 'agent', actor_id: 'a1', ts: new Date().toISOString(), object_type: 'agent_run', object_id: 'r1' }
    dispatchToGraphReducers(evt)
    expect(fn).not.toHaveBeenCalled()
  })

  it('planted error in one reducer does not prevent other reducers from running', () => {
    const errorFn = vi.fn().mockImplementation(() => { throw new Error('reducer exploded') })
    const safeFn = vi.fn()
    registerGraphReducer('task_created', errorFn)
    registerGraphReducer('task_created', safeFn)
    const evt = { workspace_id: 'w1', project_id: 'p1', evt_type: 'task_created' as const, actor_type: 'agent', actor_id: 'a1', ts: new Date().toISOString(), object_type: 'task', object_id: 't1' }
    // Must not throw
    expect(() => dispatchToGraphReducers(evt)).not.toThrow()
    expect(safeFn).toHaveBeenCalledOnce()
  })

  it('reducer_error telemetry emitted when reducer throws', () => {
    const errorFn = vi.fn().mockImplementation(() => { throw new Error('oops') })
    registerGraphReducer('memory_written', errorFn)
    const errors: string[] = []
    const origError = console.error
    console.error = (msg: unknown) => { errors.push(String(msg)) }
    const evt = { workspace_id: 'w1', project_id: 'p1', evt_type: 'memory_written' as const, actor_type: 'agent', actor_id: 'a1', ts: new Date().toISOString(), object_type: 'memory', object_id: 'm1' }
    dispatchToGraphReducers(evt)
    console.error = origError
    expect(errors.some(e => e.includes('reducer_error') || e.includes('oops'))).toBe(true)
  })

  it('multiple reducers for same event type all run', () => {
    const fn1 = vi.fn()
    const fn2 = vi.fn()
    registerGraphReducer('agent_run_finished', fn1)
    registerGraphReducer('agent_run_finished', fn2)
    const evt = { workspace_id: 'w1', project_id: 'p1', evt_type: 'agent_run_finished' as const, actor_type: 'agent', actor_id: 'a1', ts: new Date().toISOString(), object_type: 'run', object_id: 'r1' }
    dispatchToGraphReducers(evt)
    expect(fn1).toHaveBeenCalledOnce()
    expect(fn2).toHaveBeenCalledOnce()
  })
})
