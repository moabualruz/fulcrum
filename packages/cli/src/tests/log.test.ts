import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { formatEvent, parseSince, runLog } from '../log.js'
import {
  _configureDb,
  emitEvent,
  runMigrations,
  setDb,
  type FulcrumEvent,
} from 'fulcrum-agent-core'

function makeEvent(overrides: Partial<FulcrumEvent>): FulcrumEvent {
  return {
    event_id: 'evt_1',
    workspace_id: 'ws_1',
    project_id: 'proj_1',
    run_id: null,
    evt_type: 'agent_run_started',
    payload: {},
    ts: '2026-04-16T10:30:00.000Z',
    ...overrides,
  } as unknown as FulcrumEvent
}

describe('formatEvent', () => {
  describe('agent lifecycle events', () => {
    it('formats agent_run_started with role and task', () => {
      const evt = makeEvent({
        evt_type: 'agent_run_started',
        payload: { role: 'software_engineer', run_id: 'run_abc', task_id: 'task_1' },
      })
      const line = formatEvent(evt)
      expect(line).toMatch(/\[\d\d:\d\d:\d\d\]/)
      expect(line).toContain('software_engineer')
      expect(line).toContain('started')
      expect(line).toContain('run_abc')
      expect(line).toContain('task_1')
    })

    it('formats agent_run_blocked with reason', () => {
      const evt = makeEvent({
        evt_type: 'agent_run_blocked',
        payload: { role: 'qa_engineer', run_id: 'run_xyz', reason: 'test suite failing' },
      })
      const line = formatEvent(evt)
      expect(line).toContain('blocked')
      expect(line).toContain('run_xyz')
      expect(line).toContain('test suite failing')
    })

    it('formats agent_run_finished with summary', () => {
      const evt = makeEvent({
        evt_type: 'agent_run_finished',
        payload: { role: 'software_engineer', run_id: 'run_done', summary: 'all tests pass' },
      })
      const line = formatEvent(evt)
      expect(line).toContain('finished')
      expect(line).toContain('run_done')
      expect(line).toContain('all tests pass')
    })

    it('formats agent_run_failed', () => {
      const evt = makeEvent({
        evt_type: 'agent_run_failed',
        payload: { run_id: 'run_fail', error: 'OOM' },
      })
      const line = formatEvent(evt)
      expect(line).toContain('failed')
      expect(line).toContain('OOM')
    })
  })

  describe('task events', () => {
    it('formats task_created', () => {
      const evt = makeEvent({
        evt_type: 'task_created',
        payload: { title: 'Implement feature X', task_id: 'task_42' },
      })
      const line = formatEvent(evt)
      expect(line).toContain('created task')
      expect(line).toContain('Implement feature X')
    })

    it('formats task_status_changed with from/to', () => {
      const evt = makeEvent({
        evt_type: 'task_status_changed',
        payload: { title: 'Fix bug', from: 'open', status: 'in_progress' },
      })
      const line = formatEvent(evt)
      expect(line).toContain('changed task')
      expect(line).toContain('open')
      expect(line).toContain('in_progress')
    })
  })

  describe('policy events', () => {
    it('formats policy_denied', () => {
      const evt = makeEvent({
        evt_type: 'policy_denied',
        payload: { tool_name: 'bash', reason: 'destructive command blocked', role: 'software_engineer' },
      })
      const line = formatEvent(evt)
      expect(line).toContain('policy denied')
      expect(line).toContain('bash')
      expect(line).toContain('destructive command blocked')
    })
  })

  describe('fallback for unknown event types', () => {
    it('formats unknown event type gracefully', () => {
      const evt = makeEvent({
        evt_type: 'hook_executed' as FulcrumEvent['evt_type'],
        payload: { run_id: 'run_1' },
      })
      const line = formatEvent(evt)
      expect(line).toMatch(/\[\d\d:\d\d:\d\d\]/)
      expect(line).toContain('hook executed')
    })
  })

  describe('timestamp format', () => {
    it('renders timestamp as HH:mm:ss in brackets', () => {
      const evt = makeEvent({ ts: '2026-04-16T09:05:03.000Z' })
      const line = formatEvent(evt)
      // Expect HH:mm:ss format (exact hour depends on timezone, so just check pattern)
      expect(line).toMatch(/\[\d\d:\d\d:\d\d\]/)
    })
  })
})

describe('parseSince', () => {
  it('parses seconds: 30s', () => {
    const d = parseSince('30s')
    const diff = Date.now() - d.getTime()
    expect(diff).toBeGreaterThanOrEqual(29_000)
    expect(diff).toBeLessThan(31_000)
  })

  it('parses minutes: 5m', () => {
    const d = parseSince('5m')
    const diff = Date.now() - d.getTime()
    expect(diff).toBeGreaterThanOrEqual(299_000)
    expect(diff).toBeLessThan(301_000)
  })

  it('parses hours: 2h', () => {
    const d = parseSince('2h')
    const diff = Date.now() - d.getTime()
    expect(diff).toBeGreaterThanOrEqual(2 * 3_600_000 - 1000)
    expect(diff).toBeLessThan(2 * 3_600_000 + 1000)
  })

  it('parses days: 1d', () => {
    const d = parseSince('1d')
    const diff = Date.now() - d.getTime()
    expect(diff).toBeGreaterThanOrEqual(86_400_000 - 1000)
    expect(diff).toBeLessThan(86_400_000 + 1000)
  })

  it('throws on invalid format', () => {
    expect(() => parseSince('bad')).toThrow('Invalid --since format')
    expect(() => parseSince('5x')).toThrow()
    expect(() => parseSince('')).toThrow()
  })
})

describe('runLog DB filtering', () => {
  let db: Database.Database
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    db = new Database(':memory:')
    _configureDb(db)
    runMigrations(db)
    setDb(db)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    logSpy.mockRestore()
    db.close()
  })

  it('filters events by run id through object_id and payload, not a nonexistent events.run_id column', async () => {
    emitEvent({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      evt_type: 'agent_run_started',
      object_type: 'agent_run',
      object_id: 'run_keep',
      actor_type: 'agent',
      actor_id: 'software_engineer',
      payload: { role: 'software_engineer', run_id: 'run_keep', task_id: 'task_1' },
    })
    emitEvent({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      evt_type: 'agent_run_started',
      object_type: 'agent_run',
      object_id: 'run_skip',
      actor_type: 'agent',
      actor_id: 'qa_engineer',
      payload: { role: 'qa_engineer', run_id: 'run_skip', task_id: 'task_2' },
    })

    await runLog(['--run-id', 'run_keep', '--limit', '10'])

    const lines = logSpy.mock.calls.map(call => String(call[0]))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('run_keep')
    expect(lines[0]).not.toContain('run_skip')
  })

  it('includes hook_events in DB output when filtering by run id', async () => {
    db.prepare(`
      INSERT INTO hook_events
        (hook_event_id, workspace_id, session_id, tool_name, agent_role, run_id, ts, cli_name)
      VALUES
        ('hook_1', 'ws_1', 'sess_1', 'Write', 'software_engineer', 'run_hook', '2026-04-21T10:00:00.000Z', 'claude')
    `).run()

    await runLog(['--run-id', 'run_hook', '--limit', '10'])

    const lines = logSpy.mock.calls.map(call => String(call[0]))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('hook executed')
    expect(lines[0]).toContain('run_hook')
    expect(lines[0]).toContain('Write')
  })
})
