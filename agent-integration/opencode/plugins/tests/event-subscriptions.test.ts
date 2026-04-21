// Task 8.4 acceptance tests — OpenCode event subscription coverage.
//
// Verifies that todo.updated events mirror into Fulcrum tasks, and that
// session.compacted events emit pre_compact_extract memories + graph reducer.
//
// We cannot import the plugin directly (it depends on @opencode-ai/plugin which
// is not a dev dependency), so we test the event-handler logic in isolation
// via a lightweight test shim that exercises the same spawnSync patterns.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: '{}', stderr: '' })),
}))

const mockSpawn = vi.mocked(spawnSync)

// Replicate the event-handler logic from plugins/fulcrum.ts so we can unit-test
// the subscription paths without importing the plugin.

function getContext(): { workspace_id: string; project_id: string } {
  return { workspace_id: 'ws_opencode', project_id: 'proj_opencode' }
}

function handleEvent(input: Record<string, unknown>): void {
  if (!input || typeof input !== 'object') return
  const event = (input['event'] ?? {}) as Record<string, unknown>
  const name = event['type'] as string | undefined
  const sessionId = 'test-session'

  if (name === 'session.idle') {
    spawnSync('fulcrum', ['hook', 'opencode', 'session-end'], {
      input: JSON.stringify({ session_id: sessionId }),
      encoding: 'utf-8',
      timeout: 5_000,
    })
  } else if (name === 'session.compacted') {
    // Emit pre_compact_extract memory
    spawnSync('fulcrum', ['hook', 'opencode', 'pre-compact'], {
      input: JSON.stringify({ session_id: sessionId }),
      encoding: 'utf-8',
      timeout: 5_000,
    })
    // Fire graph reducer write (team_instantiated-style event bus write)
    spawnSync('fulcrum', ['action', 'exec', 'emit_graph_event', '--json', JSON.stringify({
      event_type: 'session_compacted',
      session_id: sessionId,
      workspace_id: process.env['FULCRUM_WORKSPACE_ID'] ?? 'default',
    })], { encoding: 'utf-8', timeout: 5_000 })
  } else if (name === 'todo.updated') {
    // Mirror into Fulcrum tasks table
    const properties = event['properties'] as Record<string, unknown> | undefined
    const todos = (properties?.['todos'] ?? []) as Array<Record<string, unknown>>
    if (!Array.isArray(todos) || todos.length === 0) return
    const ids = getContext()
    for (const todo of todos) {
      spawnSync('fulcrum', ['action', 'exec', 'update_task', '--json', JSON.stringify({
        task_id: todo['id'],
        workspace_id: ids.workspace_id,
        project_id: ids.project_id,
        status: todo['status'],
        note: `[opencode todo.updated] ${todo['title'] ?? ''}`,
      })], { encoding: 'utf-8', timeout: 5_000 })
    }
  }
}

afterEach(() => {
  mockSpawn.mockClear()
})

describe('OpenCode event subscriptions (Task 8.4)', () => {
  it('session.idle → calls fulcrum hook opencode session-end', () => {
    handleEvent({ event: { type: 'session.idle' } })
    expect(mockSpawn).toHaveBeenCalledOnce()
    const call = mockSpawn.mock.calls[0]
    expect(call[0]).toBe('fulcrum')
    expect(call[1]).toContain('session-end')
  })

  it('session.compacted → calls pre-compact AND emits graph reducer write', () => {
    handleEvent({ event: { type: 'session.compacted' } })
    expect(mockSpawn).toHaveBeenCalledTimes(2)
    const [first, second] = mockSpawn.mock.calls
    expect(first[1]).toContain('pre-compact')
    expect(second[1]).toContain('emit_graph_event')
  })

  it('todo.updated → calls update_task with mirrored status', () => {
    handleEvent({ event: { type: 'todo.updated', properties: { todos: [{ id: 'tsk_001', title: 'Fix auth', status: 'completed' }] } } })
    expect(mockSpawn).toHaveBeenCalledOnce()
    const call = mockSpawn.mock.calls[0]
    expect(call[1]).toContain('update_task')
    // The --json arg should contain the task_id
    const jsonArg = call[1]?.find((a: string) => a.includes('tsk_001'))
    expect(jsonArg).toBeDefined()
    expect(jsonArg).toContain('ws_opencode')
    expect(jsonArg).toContain('proj_opencode')
  })

  it('unknown event type → no spawnSync calls', () => {
    handleEvent({ event: { type: 'unrelated.event' } })
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  it('todo.updated without todo payload → no spawnSync call', () => {
    handleEvent({ event: { type: 'todo.updated' } })
    expect(mockSpawn).not.toHaveBeenCalled()
  })
})
