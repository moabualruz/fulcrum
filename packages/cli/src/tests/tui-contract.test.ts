import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildDetailLines,
  formatAgentRunLine,
  formatEventFromPayload,
  formatHeartbeatLag,
  formatTaskLine,
  policyEvents,
  selectedBlockedRun,
  type AgentRun,
  type EventLine,
  type Task,
} from '../tui/App.js'

const now = new Date('2026-04-21T12:00:00.000Z').getTime()

const task: Task = {
  task_id: 'task_123456789',
  display_id: 'TASK-1',
  title: 'Ship cockpit',
  description: 'Finish the terminal dashboard',
  status: 'running',
  status_category: 'active',
  priority: 'high',
  assigned_to: 'software_engineer',
  created_at: '2026-04-21T11:30:00.000Z',
}

const run: AgentRun = {
  run_id: 'run_123456789',
  role: 'software_engineer',
  status: 'running',
  task_id: task.task_id,
  started_at: '2026-04-21T11:00:00.000Z',
  heartbeat_at: '2026-04-21T11:59:30.000Z',
  blocker: null,
}

describe('TUI contract helpers', () => {
  it('renders task board rows with title, assigned role, and age', () => {
    expect(formatTaskLine(task, now)).toContain('Ship cockpit')
    expect(formatTaskLine(task, now)).toContain('@software_engineer')
    expect(formatTaskLine(task, now)).toContain('age:30m')
  })

  it('renders agent run rows with role, heartbeat lag, and task title', () => {
    expect(formatHeartbeatLag(run, now)).toBe('30s')
    expect(formatAgentRunLine(run, [task], now)).toContain('software_engineer')
    expect(formatAgentRunLine(run, [task], now)).toContain('hb:30s')
    expect(formatAgentRunLine(run, [task], now)).toContain('task:Ship cockpit')
  })

  it('keeps policy violations available for the policy pane', () => {
    const denied = formatEventFromPayload('policy_denied', {
      role: 'software_engineer',
      tool_name: 'Write',
      reason: 'role cannot edit files',
    })
    const normal = formatEventFromPayload('task_created', { title: 'Task' })
    const events: EventLine[] = [
      { id: 'evt_1', ts: '12:00:00', ...denied },
      { id: 'evt_2', ts: '12:00:01', ...normal },
    ]

    expect(policyEvents(events)).toHaveLength(1)
    expect(policyEvents(events)[0]?.detail).toContain('role cannot edit files')
  })

  it('selects blocked runs after policy violations in the policy pane', () => {
    const blockedRun: AgentRun = {
      ...run,
      run_id: 'run_blocked_123',
      status: 'blocked',
      blocker: 'waiting on review',
    }
    const violation: EventLine = {
      id: 'evt_policy',
      ts: '12:00:00',
      ...formatEventFromPayload('policy_denied', { reason: 'role cannot edit files' }),
    }

    expect(selectedBlockedRun({
      activePane: 'policy',
      selected: 0,
      runs: [blockedRun],
      blocked: [blockedRun],
      violations: [violation],
    })).toBeNull()

    expect(selectedBlockedRun({
      activePane: 'policy',
      selected: 1,
      runs: [blockedRun],
      blocked: [blockedRun],
      violations: [violation],
    })?.run_id).toBe(blockedRun.run_id)
  })

  it('builds detail output for selected tasks, runs, and events', () => {
    const event = { id: 'evt_1', ts: '12:00:00', ...formatEventFromPayload('task_created', { title: 'Ship cockpit' }) }

    expect(buildDetailLines({
      activePane: 'board',
      selected: 0,
      tasks: [task],
      runs: [run],
      events: [event],
      blocked: [],
      violations: [],
    }).join('\n')).toContain('Description: Finish the terminal dashboard')

    expect(buildDetailLines({
      activePane: 'agents',
      selected: 0,
      tasks: [task],
      runs: [run],
      events: [event],
      blocked: [],
      violations: [],
    }).join('\n')).toContain('Heartbeat lag')

    expect(buildDetailLines({
      activePane: 'events',
      selected: 0,
      tasks: [task],
      runs: [run],
      events: [event],
      blocked: [],
      violations: [],
    }).join('\n')).toContain('Payload:')
  })

  it('does not reintroduce TUI data polling', () => {
    const source = readFileSync(new URL('../tui/App.tsx', import.meta.url), 'utf8')
    expect(source).not.toContain('setInterval(')
  })

  it('keeps the documented task done keyboard action wired', () => {
    const source = readFileSync(new URL('../tui/App.tsx', import.meta.url), 'utf8')
    expect(source).toContain("input === 'd'")
    expect(source).toContain('patchJson(`/tasks/${task.task_id}`')
    expect(source).toContain("status: 'completed'")
  })
})
