// packages/core/src/tests/event-bus.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { getEventBus, setEventBus, resetEventBus } from '../event-bus.js'
import type { EventHandler } from '../event-bus.js'
import type { EmitEventInput } from '../events.js'

function makeEvent(overrides: Partial<EmitEventInput> = {}): EmitEventInput {
  return {
    workspace_id: 'ws_test',
    evt_type: 'task_created',
    actor_type: 'agent',
    actor_id: 'agent_test',
    ...overrides,
  }
}

afterEach(() => {
  resetEventBus()
})

describe('on / fire', () => {
  it('calls registered handler when matching event is fired', () => {
    const received: EmitEventInput[] = []
    getEventBus().on('task_created', (evt) => { received.push(evt) })
    getEventBus().fire(makeEvent({ evt_type: 'task_created' }))
    expect(received).toHaveLength(1)
    expect(received[0].evt_type).toBe('task_created')
  })

  it('does NOT call handler for a different event type', () => {
    const received: EmitEventInput[] = []
    getEventBus().on('task_created', (evt) => { received.push(evt) })
    getEventBus().fire(makeEvent({ evt_type: 'memory_written' }))
    expect(received).toHaveLength(0)
  })

  it('calls multiple handlers for the same event type', () => {
    const log: string[] = []
    getEventBus().on('task_created', () => { log.push('handler_a') })
    getEventBus().on('task_created', () => { log.push('handler_b') })
    getEventBus().fire(makeEvent())
    expect(log).toEqual(['handler_a', 'handler_b'])
  })
})

describe('off', () => {
  it('stops calling a removed handler', () => {
    const received: EmitEventInput[] = []
    const handler: EventHandler = (evt) => { received.push(evt) }
    getEventBus().on('task_created', handler)
    getEventBus().fire(makeEvent())
    getEventBus().off('task_created', handler)
    getEventBus().fire(makeEvent())
    expect(received).toHaveLength(1)
  })

  it('removing a handler that was not registered is a no-op', () => {
    expect(() => getEventBus().off('task_created', () => {})).not.toThrow()
  })
})

describe('once', () => {
  it('calls handler only once then removes it', () => {
    const received: EmitEventInput[] = []
    getEventBus().once('task_created', (evt) => { received.push(evt) })
    getEventBus().fire(makeEvent())
    getEventBus().fire(makeEvent())
    getEventBus().fire(makeEvent())
    expect(received).toHaveLength(1)
  })
})

describe('onAny / offAny', () => {
  it('receives all event types', () => {
    const types: string[] = []
    getEventBus().onAny((evt) => { types.push(evt.evt_type) })
    getEventBus().fire(makeEvent({ evt_type: 'task_created' }))
    getEventBus().fire(makeEvent({ evt_type: 'memory_written' }))
    getEventBus().fire(makeEvent({ evt_type: 'agent_run_finished' }))
    expect(types).toEqual(['task_created', 'memory_written', 'agent_run_finished'])
  })

  it('offAny stops global handler', () => {
    const types: string[] = []
    const handler: EventHandler = (evt) => { types.push(evt.evt_type) }
    getEventBus().onAny(handler)
    getEventBus().fire(makeEvent({ evt_type: 'task_created' }))
    getEventBus().offAny(handler)
    getEventBus().fire(makeEvent({ evt_type: 'memory_written' }))
    expect(types).toEqual(['task_created'])
  })
})

describe('listenerCount', () => {
  it('returns 0 on a fresh bus', () => {
    expect(getEventBus().listenerCount()).toBe(0)
  })

  it('counts typed and any-handlers', () => {
    getEventBus().on('task_created', () => {})
    getEventBus().on('task_created', () => {})
    getEventBus().onAny(() => {})
    // 2 typed + 1 any = 3 (for any type query)
    expect(getEventBus().listenerCount()).toBe(3)
    // Per-type count includes any-handlers
    expect(getEventBus().listenerCount('task_created')).toBe(3)
    // Type with no specific handlers still has the any-handler
    expect(getEventBus().listenerCount('memory_written')).toBe(1)
  })
})

describe('error isolation', () => {
  it('a throwing handler does not prevent subsequent handlers from running', () => {
    const received: string[] = []
    getEventBus().on('task_created', () => { throw new Error('simulated crash') })
    getEventBus().on('task_created', () => { received.push('second') })
    expect(() => getEventBus().fire(makeEvent())).not.toThrow()
    expect(received).toEqual(['second'])
  })
})

describe('setEventBus / resetEventBus', () => {
  it('setEventBus replaces the active bus', () => {
    const custom = getEventBus()
    const log: string[] = []
    custom.on('task_created', () => { log.push('custom') })
    setEventBus(custom)
    getEventBus().fire(makeEvent())
    expect(log).toEqual(['custom'])
  })

  it('resetEventBus starts fresh with no handlers', () => {
    const received: EmitEventInput[] = []
    getEventBus().on('task_created', (evt) => { received.push(evt) })
    resetEventBus()
    getEventBus().fire(makeEvent())
    expect(received).toHaveLength(0)
  })
})
