// packages/cli/src/tui/App.tsx
// Fulcrum Cockpit TUI — Ink v4 terminal dashboard
//
// Layout:
//   [header bar]
//   [task board pane]    [agent runs pane]
//   [event stream pane]  [policy/blocked pane]
//
// Navigation: tab to cycle panes, arrow keys within pane, q to quit,
// u to unblock selected blocked run, k to kill selected run, n to create task.

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Box, Text, useInput, useApp, measureElement } from 'ink'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Task {
  task_id: string
  display_id: string
  title: string
  status: string
  status_category: string
  priority: string
  assigned_to: string | null
}

interface AgentRun {
  run_id: string
  role: string
  status: string
  task_id: string | null
  started_at: string
  heartbeat_at: string | null
  blocker: string | null
}

interface EventLine {
  id: string
  ts: string
  role: string
  verb: string
  detail: string
  isBlocked?: boolean
  isPolicy?: boolean
}

interface PmOverview {
  delivery_health?: {
    active_work?: number
    blocked_work?: number
    blocked_pct?: number
    open_reviews?: number
  }
  issues?: {
    blocked?: number
    in_review?: number
  }
  plans?: {
    active?: number
  }
  focus?: {
    blocked_issues?: Array<{ display_id?: string; title?: string }>
    active_plans?: Array<{ display_id?: string; title?: string }>
    pending_reviews?: Array<{ review_id?: string; target_type?: string; target_id?: string }>
  }
}

type Pane = 'board' | 'agents' | 'events' | 'policy' | 'pm'

const PANE_ORDER: Pane[] = ['board', 'agents', 'events', 'policy', 'pm']

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtTs(iso: string): string {
  const d = new Date(iso)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function fmtAge(startedAt: string): string {
  const sec = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  return `${Math.floor(sec / 3600)}h`
}

function statusColor(status: string): string {
  switch (status) {
    case 'running': case 'active': case 'in_progress': return 'green'
    case 'blocked': return 'red'
    case 'waiting': case 'starting': return 'yellow'
    case 'done': case 'completed': case 'finished': return 'gray'
    case 'failed': case 'aborted': return 'redBright'
    default: return 'white'
  }
}

function formatEventFromPayload(evtType: string, payload: Record<string, unknown>): Omit<EventLine, 'id' | 'ts'> {
  const role = (payload['role'] as string | undefined) ?? (payload['agent_role'] as string | undefined) ?? 'system'
  let verb = evtType.replace(/_/g, ' ')
  let detail = ''
  let isBlocked = false
  let isPolicy = false

  switch (evtType) {
    case 'agent_run_started': verb = 'started'; detail = String(payload['run_id'] ?? ''); break
    case 'agent_run_blocked': verb = 'BLOCKED'; detail = String(payload['reason'] ?? payload['run_id'] ?? ''); isBlocked = true; break
    case 'agent_run_finished': verb = 'finished'; detail = String(payload['run_id'] ?? ''); break
    case 'agent_run_failed': verb = 'failed'; detail = String(payload['error'] ?? payload['run_id'] ?? ''); break
    case 'agent_run_progress': verb = 'heartbeat'; detail = String(payload['status'] ?? ''); break
    case 'task_created': verb = 'created task'; detail = String(payload['title'] ?? payload['task_id'] ?? ''); break
    case 'task_status_changed': verb = 'task status'; detail = `${payload['from'] ?? '?'} → ${payload['status'] ?? '?'}`; break
    case 'policy_denied': verb = 'POLICY DENIED'; detail = `${payload['tool_name'] ?? ''}: ${payload['reason'] ?? ''}`; isPolicy = true; break
    case 'memory_written': verb = 'wrote memory'; detail = String(payload['content'] ?? '').slice(0, 40); break
    case 'merge_completed': verb = 'merged'; detail = String(payload['task_id'] ?? ''); break
  }

  return { role, verb, detail, isBlocked, isPolicy }
}

// ── Data fetching ──────────────────────────────────────────────────────────────

const DEFAULT_PORT = '4721'

async function fetchJson<T>(path: string): Promise<T | null> {
  const port = process.env['FULCRUM_MONITOR_PORT'] ?? DEFAULT_PORT
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`)
    if (!res.ok) return null
    return await res.json() as T
  } catch {
    return null
  }
}

async function postJson(path: string, body: unknown): Promise<boolean> {
  const port = process.env['FULCRUM_MONITOR_PORT'] ?? DEFAULT_PORT
  const token = process.env['FULCRUM_MONITOR_TOKEN']
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

// ── Components ─────────────────────────────────────────────────────────────────

function Header({ wsId, activePane, runCount, lastEventTs }: {
  wsId: string | null
  activePane: Pane
  runCount: number
  lastEventTs: string | null
}) {
  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1} flexShrink={0}>
      <Text bold color="cyan">⬡ Fulcrum</Text>
      {wsId && <Text color="gray"> ws:{wsId}</Text>}
      <Text color="gray"> | </Text>
      <Text color="green">{runCount} active</Text>
      {lastEventTs && <Text color="gray"> | last:{lastEventTs}</Text>}
      <Text color="gray"> | </Text>
      <Text color="yellow">pane: {activePane}</Text>
      <Text color="gray"> [tab=switch  q=quit  u=unblock  k=kill  n=new task]</Text>
    </Box>
  )
}

function TaskBoard({ tasks, selected, focused }: {
  tasks: Task[]
  selected: number
  focused: boolean
}) {
  const byCategory = {
    backlog: tasks.filter(t => t.status_category === 'backlog'),
    active: tasks.filter(t => t.status_category === 'active'),
    blocked: tasks.filter(t => t.status_category === 'blocked'),
    done: tasks.filter(t => t.status_category === 'done'),
  }

  return (
    <Box borderStyle={focused ? 'double' : 'single'} borderColor={focused ? 'cyan' : 'gray'} flexDirection="column" flexGrow={1}>
      <Text bold color="gray"> Task Board</Text>
      <Box flexDirection="row" flexGrow={1}>
        {(['backlog', 'active', 'blocked', 'done'] as const).map(cat => (
          <Box key={cat} flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray" paddingX={1}>
            <Text bold color={cat === 'backlog' ? 'gray' : cat === 'active' ? 'cyan' : cat === 'blocked' ? 'red' : 'green'}>
              {cat.toUpperCase()} ({byCategory[cat].length})
            </Text>
            {byCategory[cat].slice(0, 8).map((t, i) => (
              <Box key={t.task_id}>
                <Text color={focused && selected < tasks.length && tasks[selected]?.task_id === t.task_id ? 'cyan' : 'white'}>
                  {t.display_id || t.task_id.slice(0, 6)} {t.title.slice(0, 18)}
                </Text>
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function AgentRuns({ runs, selected, focused }: {
  runs: AgentRun[]
  selected: number
  focused: boolean
}) {
  const visible = runs.slice(0, 15)
  return (
    <Box borderStyle={focused ? 'double' : 'single'} borderColor={focused ? 'cyan' : 'gray'} flexDirection="column" flexGrow={1}>
      <Text bold color="gray"> Agent Runs (last {runs.length})</Text>
      {visible.length === 0 && <Text color="gray">  No active runs</Text>}
      {visible.map((run, i) => (
        <Box key={run.run_id}>
          <Text color={focused && i === selected ? 'bgCyan' : undefined}>
            <Text color={statusColor(run.status)}>● </Text>
            <Text color="cyan">{run.role.slice(0, 16).padEnd(16)}</Text>
            <Text color="gray"> {run.task_id?.slice(0, 8) ?? 'none'.padEnd(8)}</Text>
            <Text color="gray"> {fmtAge(run.started_at)}</Text>
          </Text>
        </Box>
      ))}
    </Box>
  )
}

function EventStream({ events, focused }: {
  events: EventLine[]
  focused: boolean
}) {
  return (
    <Box borderStyle={focused ? 'double' : 'single'} borderColor={focused ? 'cyan' : 'gray'} flexDirection="column" flexGrow={1} overflow="hidden">
      <Text bold color="gray"> Event Stream</Text>
      {events.slice(0, 20).map(evt => (
        <Box key={evt.id}>
          <Text color="gray">[{evt.ts}] </Text>
          <Text color="cyan">{evt.role.slice(0, 12).padEnd(12)} </Text>
          <Text color={evt.isBlocked ? 'red' : evt.isPolicy ? 'yellow' : 'white'}>
            {evt.verb} {evt.detail.slice(0, 40)}
          </Text>
        </Box>
      ))}
    </Box>
  )
}

function PolicyPane({ blocked, selected, focused }: {
  blocked: AgentRun[]
  selected: number
  focused: boolean
}) {
  return (
    <Box borderStyle={focused ? 'double' : 'single'} borderColor={focused ? 'cyan' : 'gray'} flexDirection="column" flexGrow={1}>
      <Text bold color="gray"> Blocked Runs ({blocked.length})</Text>
      {blocked.length === 0 && <Text color="green">  No blocked runs</Text>}
      {blocked.map((run, i) => (
        <Box key={run.run_id} flexDirection="column">
          <Text color={focused && i === selected ? 'bgCyan' : 'white'}>
            <Text color="red">● </Text>
            <Text color="cyan">{run.role.slice(0, 16)}</Text>
          </Text>
          {run.blocker && <Text color="gray">  {run.blocker.slice(0, 40)}</Text>}
        </Box>
      ))}
    </Box>
  )
}

function PmPane({ overview, focused }: {
  overview: PmOverview | null
  focused: boolean
}) {
  const health = overview?.delivery_health ?? {}
  const issues = overview?.issues ?? {}
  const plans = overview?.plans ?? {}
  const focus = overview?.focus ?? {}
  const blockedIssues = focus.blocked_issues ?? []
  const activePlans = focus.active_plans ?? []

  return (
    <Box borderStyle={focused ? 'double' : 'single'} borderColor={focused ? 'cyan' : 'gray'} flexDirection="column" flexGrow={1}>
      <Text bold color="gray"> PM Overview</Text>
      <Text color="cyan"> Active work: <Text color="white">{health.active_work ?? 0}</Text> <Text color="gray">| Blocked: {health.blocked_pct ?? 0}%</Text></Text>
      <Text color="cyan"> Open reviews: <Text color="white">{health.open_reviews ?? 0}</Text> <Text color="gray">| Active plans: {plans.active ?? 0}</Text></Text>
      <Text color="cyan"> Blocked issues: <Text color="white">{issues.blocked ?? 0}</Text> <Text color="gray">| In review: {issues.in_review ?? 0}</Text></Text>
      {blockedIssues.slice(0, 2).map(issue => (
        <Text key={`${issue.display_id}-${issue.title}`} color="yellow"> {issue.display_id ?? 'issue'} {issue.title ?? ''}</Text>
      ))}
      {activePlans.slice(0, 2).map(plan => (
        <Text key={`${plan.display_id}-${plan.title}`} color="green"> {plan.display_id ?? 'plan'} {plan.title ?? ''}</Text>
      ))}
    </Box>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────────

export default function App() {
  const { exit } = useApp()

  // Data state
  const [tasks, setTasks] = useState<Task[]>([])
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [events, setEvents] = useState<EventLine[]>([])
  const [pmOverview, setPmOverview] = useState<PmOverview | null>(null)
  const [wsId, setWsId] = useState<string | null>(null)
  const [lastEventTs, setLastEventTs] = useState<string | null>(null)
  const [monitorDown, setMonitorDown] = useState(false)

  // Navigation state
  const [activePane, setActivePane] = useState<Pane>('board')
  const [selected, setSelected] = useState(0)
  const [newTaskMode, setNewTaskMode] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  const eventCountRef = useRef(0)

  // Derived
  const blocked = runs.filter(r => r.status === 'blocked')
  const activeRuns = runs.filter(r => ['running', 'waiting', 'starting'].includes(r.status))
  const paneItems = activePane === 'board'
    ? tasks
    : activePane === 'agents'
      ? runs
      : activePane === 'policy'
        ? blocked
        : activePane === 'pm'
          ? (pmOverview?.focus?.blocked_issues ?? [])
          : events
  const paneLen = paneItems.length

  // ── Data loading ──────────────────────────────────────────────────────────

  async function loadData() {
    const [statusData, tasksData, agentsData, pmData] = await Promise.all([
      fetchJson<{ workspace_id: string | null }>('/status'),
      fetchJson<{ data: Task[] }>('/tasks'),
      fetchJson<{ data: AgentRun[] }>('/agents'),
      fetchJson<{ data: PmOverview }>('/pm/overview'),
    ])

    if (!statusData) {
      setMonitorDown(true)
      // Fall back to direct DB reads (read-only, no keyboard actions)
      try {
        const { getDb, runMigrations } = await import('@fulcrum/core')
        const db = getDb()
        runMigrations(db)
        const rows = db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 50').all() as Task[]
        setTasks(rows)
      } catch { /* no DB either */ }
      return
    }

    setMonitorDown(false)
    if (statusData.workspace_id) setWsId(statusData.workspace_id)
    if (tasksData?.data) setTasks(tasksData.data)
    if (agentsData?.data) setRuns(agentsData.data)
    if (pmData?.data) setPmOverview(pmData.data)
  }

  // ── SSE streaming ──────────────────────────────────────────────────────────

  useEffect(() => {
    loadData()

    const port = process.env['FULCRUM_MONITOR_PORT'] ?? DEFAULT_PORT
    const url = `http://127.0.0.1:${port}/events/stream`

    let aborted = false
    const controller = new AbortController()

    async function connect() {
      try {
        const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/event-stream' } })
        if (!res.ok || !res.body) { setMonitorDown(true); return }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''

        while (!aborted) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          let dataLine = ''
          for (const line of lines) {
            if (line.startsWith('data:')) {
              dataLine = line.slice(5).trim()
            } else if (line === '' && dataLine) {
              try {
                const evt = JSON.parse(dataLine) as { evt_type: string; payload: Record<string, unknown>; created_at: string; event_id?: string }
                const { role, verb, detail, isBlocked, isPolicy } = formatEventFromPayload(evt.evt_type, evt.payload ?? {})
                const ts = fmtTs(evt.created_at || new Date().toISOString())
                const id = evt.event_id ?? String(++eventCountRef.current)
                setEvents(prev => [{ id, ts, role, verb, detail, isBlocked, isPolicy }, ...prev].slice(0, 200))
                setLastEventTs(ts)
                // Refresh panels on relevant events
                if (evt.evt_type.startsWith('agent_run') || evt.evt_type.startsWith('task')) {
                  loadData()
                }
              } catch { /* skip malformed */ }
              dataLine = ''
            }
          }
        }
      } catch (err) {
        if (!aborted) {
          setMonitorDown(true)
          setTimeout(connect, 3000)
        }
      }
    }

    void connect()
    const interval = setInterval(() => { void loadData() }, 10000)

    return () => {
      aborted = true
      controller.abort()
      clearInterval(interval)
    }
  }, [])

  // ── Keyboard input ─────────────────────────────────────────────────────────

  useInput(async (input, key) => {
    if (newTaskMode) {
      if (key.escape) {
        setNewTaskMode(false)
        setNewTaskTitle('')
        return
      }
      if (key.return) {
        if (newTaskTitle.trim()) {
          const ok = await postJson('/tasks', { title: newTaskTitle.trim(), workspace_id: wsId ?? undefined })
          setStatusMsg(ok ? `Task created: ${newTaskTitle}` : 'Failed to create task')
          setTimeout(() => setStatusMsg(null), 3000)
          if (ok) await loadData()
        }
        setNewTaskMode(false)
        setNewTaskTitle('')
        return
      }
      if (key.backspace || key.delete) {
        setNewTaskTitle(prev => prev.slice(0, -1))
        return
      }
      if (!key.ctrl && !key.meta && input) {
        setNewTaskTitle(prev => prev + input)
      }
      return
    }

    if (input === 'q' || input === 'Q') {
      exit()
      return
    }

    if (key.tab) {
      const idx = PANE_ORDER.indexOf(activePane)
      setActivePane(PANE_ORDER[(idx + 1) % PANE_ORDER.length]!)
      setSelected(0)
      return
    }

    if (key.upArrow) {
      setSelected(prev => Math.max(0, prev - 1))
      return
    }
    if (key.downArrow) {
      setSelected(prev => Math.min(Math.max(0, paneLen - 1), prev + 1))
      return
    }

    // Actions
    if (input === 'n' || input === 'N') {
      if (!monitorDown) setNewTaskMode(true)
      return
    }

    if (input === 'u' || input === 'U') {
      // Unblock selected blocked run
      const run = blocked[selected]
      if (run) {
        const ok = await postJson(`/runs/${run.run_id}/unblock`, {})
        setStatusMsg(ok ? `Unblocked ${run.run_id.slice(0, 8)}` : 'Unblock failed (check auth token?)')
        setTimeout(() => setStatusMsg(null), 3000)
        if (ok) await loadData()
      }
      return
    }

    if (input === 'k' || input === 'K') {
      // Kill selected run
      const run = activePane === 'agents' ? runs[selected] : activePane === 'policy' ? blocked[selected] : null
      if (run) {
        const ok = await postJson(`/runs/${run.run_id}/kill`, { reason: 'Operator kill via TUI' })
        setStatusMsg(ok ? `Killed ${run.run_id.slice(0, 8)}` : 'Kill failed (check auth token?)')
        setTimeout(() => setStatusMsg(null), 3000)
        if (ok) await loadData()
      }
      return
    }
  })

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Box flexDirection="column" height="100%">
      <Header wsId={wsId} activePane={activePane} runCount={activeRuns.length} lastEventTs={lastEventTs} />

      {monitorDown && (
        <Box borderStyle="single" borderColor="yellow">
          <Text color="yellow"> Monitor not running — read-only DB mode. Start `fulcrum serve monitor` for live updates and actions.</Text>
        </Box>
      )}

      {newTaskMode && (
        <Box borderStyle="single" borderColor="green" paddingX={1}>
          <Text color="green">New task title: </Text>
          <Text>{newTaskTitle}</Text>
          <Text color="gray">█</Text>
          <Text color="gray"> [Enter=create  Esc=cancel]</Text>
        </Box>
      )}

      {statusMsg && (
        <Box>
          <Text color="yellow"> {statusMsg}</Text>
        </Box>
      )}

      <Box flexGrow={1} flexDirection="row">
        <Box flexDirection="column" flexGrow={1}>
          <TaskBoard tasks={tasks} selected={selected} focused={activePane === 'board'} />
          <EventStream events={events} focused={activePane === 'events'} />
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          <AgentRuns runs={runs} selected={selected} focused={activePane === 'agents'} />
          <PolicyPane blocked={blocked} selected={selected} focused={activePane === 'policy'} />
          <PmPane overview={pmOverview} focused={activePane === 'pm'} />
        </Box>
      </Box>
    </Box>
  )
}
