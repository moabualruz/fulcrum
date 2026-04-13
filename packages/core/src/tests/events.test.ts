import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { emitEvent } from '../events.js'

beforeEach(() => {
  const db = createTestDb()
  // events table is created by MIGRATION_002 (Task 5)
  // create it here for Task 4 isolation
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      evt_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id TEXT,
      evt_type TEXT NOT NULL,
      ts TEXT NOT NULL DEFAULT (datetime('now')),
      object_type TEXT,
      object_id TEXT,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      severity TEXT NOT NULL DEFAULT 'info',
      trace_id TEXT,
      span_id TEXT,
      correlation_id TEXT
    )
  `)
  db.prepare("INSERT INTO workspaces VALUES ('ws_1','test ws',datetime('now'))").run()
})
afterEach(() => resetTestDb())

describe('emitEvent', () => {
  it('inserts an event row with correct fields', () => {
    emitEvent({
      workspace_id: 'ws_1',
      evt_type: 'task_created',
      actor_type: 'agent',
      actor_id: 'agent-xyz',
      object_type: 'task',
      object_id: 'task_01',
      payload: { title: 'Test task' },
    })
    const db = getDb()
    const row = db.prepare('SELECT * FROM events WHERE workspace_id = ?').get('ws_1') as Record<string, unknown>
    expect(row).toBeTruthy()
    expect(row.evt_type).toBe('task_created')
    expect(row.actor_type).toBe('agent')
    expect(row.actor_id).toBe('agent-xyz')
    expect(row.object_type).toBe('task')
    expect(row.object_id).toBe('task_01')
    expect(JSON.parse(row.payload as string)).toEqual({ title: 'Test task' })
    expect(row.severity).toBe('info')
    expect(row.evt_id).toMatch(/^evt_[0-9A-Z]{26}$/)
  })

  it('defaults severity to info', () => {
    emitEvent({ workspace_id: 'ws_1', evt_type: 'memory_written', actor_type: 'system', actor_id: 'core' })
    const db = getDb()
    const row = db.prepare('SELECT severity FROM events WHERE evt_type = ?').get('memory_written') as { severity: string }
    expect(row.severity).toBe('info')
  })

  it('accepts custom severity', () => {
    emitEvent({ workspace_id: 'ws_1', evt_type: 'policy_denied', actor_type: 'system', actor_id: 'core', severity: 'warn' })
    const db = getDb()
    const row = db.prepare('SELECT severity FROM events WHERE evt_type = ?').get('policy_denied') as { severity: string }
    expect(row.severity).toBe('warn')
  })

  it('stores optional project_id', () => {
    emitEvent({ workspace_id: 'ws_1', project_id: 'proj_1', evt_type: 'task_created', actor_type: 'agent', actor_id: 'a1' })
    const db = getDb()
    const row = db.prepare('SELECT project_id FROM events').get() as { project_id: string | null }
    expect(row.project_id).toBe('proj_1')
  })

  it('stores null project_id when not provided', () => {
    emitEvent({ workspace_id: 'ws_1', evt_type: 'task_created', actor_type: 'agent', actor_id: 'a1' })
    const db = getDb()
    const row = db.prepare('SELECT project_id FROM events').get() as { project_id: string | null }
    expect(row.project_id).toBeNull()
  })

  it('stores trace/span/correlation ids', () => {
    emitEvent({
      workspace_id: 'ws_1', evt_type: 'task_created', actor_type: 'agent', actor_id: 'a1',
      trace_id: 'trace-abc', span_id: 'span-def', correlation_id: 'corr-ghi',
    })
    const db = getDb()
    const row = db.prepare('SELECT trace_id, span_id, correlation_id FROM events').get() as Record<string, string>
    expect(row.trace_id).toBe('trace-abc')
    expect(row.span_id).toBe('span-def')
    expect(row.correlation_id).toBe('corr-ghi')
  })

  it('emits multiple events independently', () => {
    emitEvent({ workspace_id: 'ws_1', evt_type: 'task_created', actor_type: 'agent', actor_id: 'a1' })
    emitEvent({ workspace_id: 'ws_1', evt_type: 'agent_run_started', actor_type: 'agent', actor_id: 'a1' })
    emitEvent({ workspace_id: 'ws_1', evt_type: 'agent_run_finished', actor_type: 'agent', actor_id: 'a1' })
    const db = getDb()
    const rows = db.prepare('SELECT evt_id FROM events').all() as { evt_id: string }[]
    expect(rows).toHaveLength(3)
    const ids = rows.map(r => r.evt_id)
    expect(new Set(ids).size).toBe(3)
  })
})
