// packages/cli/src/log.ts
// fulcrum log — human-readable agent activity feed
//
// Format: [HH:mm:ss] <role> <verb> <noun> — <detail>
// Sources: monitor SSE stream (--follow) or events table (default, last 50)

import type { FulcrumEvent } from 'fulcrum-agent-core'

// ── Event formatting ──────────────────────────────────────────────────────────

function formatTime(isoTs: string): string {
  const d = new Date(isoTs)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

type EventPayload = Record<string, unknown>

/**
 * Convert a FulcrumEvent (or DB row with same shape) to a human-readable line.
 * Format: [HH:mm:ss] <role> <verb> <noun> — <detail>
 */
export function formatEvent(evt: FulcrumEvent): string {
  const ts = formatTime(evt.ts)
  const payload = (evt.payload ?? {}) as EventPayload
  const role = (payload['role'] as string | undefined) ?? (payload['agent_role'] as string | undefined) ?? 'system'

  let verb = 'emitted'
  // TS narrows noun to EventType from the initialiser; widen to string so
  // subsequent String(payload['x']) assignments typecheck.
  let noun: string = evt.evt_type
  let detail = ''

  switch (evt.evt_type) {
    case 'task_created':
      verb = 'created task'
      noun = String(payload['title'] ?? payload['task_id'] ?? '')
      detail = `status:${payload['status'] ?? 'open'}`
      break
    case 'task_status_changed':
      verb = 'changed task'
      noun = String(payload['title'] ?? payload['task_id'] ?? '')
      detail = `${payload['from'] ?? '?'} → ${payload['status'] ?? payload['to'] ?? '?'}`
      break
    case 'agent_run_created':
      verb = 'created run'
      noun = String(payload['run_id'] ?? '')
      detail = `role:${role}`
      break
    case 'agent_run_started':
      verb = 'started'
      noun = String(payload['run_id'] ?? '')
      detail = `role:${role} task:${payload['task_id'] ?? 'none'}`
      break
    case 'agent_run_progress':
      verb = 'heartbeat'
      noun = String(payload['run_id'] ?? '')
      detail = String(payload['status'] ?? '')
      break
    case 'agent_run_blocked':
      verb = 'blocked'
      noun = String(payload['run_id'] ?? '')
      detail = String(payload['reason'] ?? payload['escalation_reason'] ?? '')
      break
    case 'agent_run_failed':
      verb = 'failed'
      noun = String(payload['run_id'] ?? '')
      detail = String(payload['error'] ?? payload['reason'] ?? '')
      break
    case 'agent_run_finished':
      verb = 'finished'
      noun = String(payload['run_id'] ?? '')
      detail = String(payload['summary'] ?? '')
      break
    case 'policy_denied':
      verb = 'policy denied'
      noun = String(payload['tool_name'] ?? payload['check'] ?? '')
      detail = String(payload['reason'] ?? '')
      break
    case 'hook_executed':
      verb = 'hook executed'
      noun = String(payload['run_id'] ?? payload['session_id'] ?? '')
      detail = String(payload['tool_name'] ?? payload['cli_name'] ?? '')
      break
    case 'memory_written':
      verb = 'wrote memory'
      noun = String(payload['memory_id'] ?? '')
      detail = String(payload['content'] ?? '').slice(0, 60)
      break
    case 'memory_recalled':
      verb = 'recalled memory'
      noun = String(payload['query'] ?? '')
      detail = `${payload['count'] ?? 0} results`
      break
    case 'handoff_created':
      verb = 'created handoff'
      noun = String(payload['handoff_id'] ?? '')
      detail = String(payload['scope'] ?? '')
      break
    case 'handoff_consumed':
      verb = 'consumed handoff'
      noun = String(payload['handoff_id'] ?? '')
      break
    case 'artifact_written':
      verb = 'wrote artifact'
      noun = String(payload['artifact_path'] ?? payload['artifact_id'] ?? '')
      detail = String(payload['artifact_type'] ?? '')
      break
    case 'merge_queued':
      verb = 'queued merge'
      noun = String(payload['task_id'] ?? payload['worktree'] ?? '')
      break
    case 'merge_started':
      verb = 'started merge'
      noun = String(payload['task_id'] ?? payload['worktree'] ?? '')
      break
    case 'merge_completed':
      verb = 'completed merge'
      noun = String(payload['task_id'] ?? payload['worktree'] ?? '')
      break
    case 'merge_conflicted':
      verb = 'merge conflict'
      noun = String(payload['task_id'] ?? payload['worktree'] ?? '')
      detail = String(payload['error'] ?? '')
      break
    case 'review_created':
      verb = 'created review'
      noun = String(payload['review_id'] ?? '')
      break
    case 'review_updated':
      verb = 'updated review'
      noun = String(payload['review_id'] ?? '')
      detail = String(payload['status'] ?? '')
      break
    case 'workflow_step_completed':
      verb = 'completed step'
      noun = String(payload['step_id'] ?? payload['step_name'] ?? '')
      detail = String(payload['workflow_id'] ?? '')
      break
    default:
      verb = evt.evt_type.replace(/_/g, ' ')
      noun = String(payload['id'] ?? payload['run_id'] ?? payload['task_id'] ?? '')
      break
  }

  const parts = [`[${ts}]`, role, verb, noun]
  if (detail) parts.push(`— ${detail}`)
  return parts.filter(Boolean).join(' ')
}

function runIdFromEvent(evt: FulcrumEvent & { run_id?: string }): string | undefined {
  if (typeof evt.run_id === 'string') return evt.run_id
  if (evt.object_type === 'agent_run' && typeof evt.object_id === 'string') return evt.object_id
  const payload = (evt.payload ?? {}) as EventPayload
  return typeof payload['run_id'] === 'string' ? payload['run_id'] : undefined
}

function eventMatchesRun(evt: FulcrumEvent & { run_id?: string }, runId?: string): boolean {
  return !runId || runIdFromEvent(evt) === runId
}

// ── parseSince ────────────────────────────────────────────────────────────────

export function parseSince(since: string): Date {
  const match = since.match(/^(\d+)(s|m|h|d)$/)
  if (!match) throw new Error(`Invalid --since format: ${since}. Use e.g. 30m, 2h, 1d`)
  const n = parseInt(match[1]!, 10)
  const unit = match[2]!
  const ms = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!
  return new Date(Date.now() - n * ms)
}

// ── runLog ────────────────────────────────────────────────────────────────────

export async function runLog(argv: string[]): Promise<void> {
  const follow = argv.includes('--follow')
  const runIdIdx = argv.indexOf('--run-id')
  const runId = runIdIdx >= 0 ? argv[runIdIdx + 1] : undefined
  const sinceIdx = argv.indexOf('--since')
  const sinceArg = sinceIdx >= 0 ? argv[sinceIdx + 1] : undefined
  const sinceDate = sinceArg ? parseSince(sinceArg) : undefined
  const limit = (() => {
    const idx = argv.indexOf('--limit')
    if (idx >= 0 && argv[idx + 1]) return parseInt(argv[idx + 1]!, 10)
    return 50
  })()

  // Try SSE stream from monitor if --follow is requested
  if (follow) {
    await followSse(runId, sinceDate)
    return
  }

  // Read from DB
  await readFromDb(limit, runId, sinceDate)
}

// ── SSE follow mode ───────────────────────────────────────────────────────────

async function followSse(runId?: string, sinceDate?: Date): Promise<void> {
  const monitorPort = process.env['FULCRUM_MONITOR_PORT'] ?? '4721'
  const url = `http://127.0.0.1:${monitorPort}/events/stream`

  // Fallback to DB polling when monitor is not running
  let reachable = false
  try {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 1000)
    const res = await fetch(`http://127.0.0.1:${monitorPort}/status`, { signal: ctrl.signal })
    clearTimeout(tid)
    reachable = res.ok
  } catch { /* unreachable */ }

  if (!reachable) {
    process.stderr.write('[fulcrum log] Monitor not running — falling back to DB tail (poll every 2s)\n')
    await pollDb(runId, sinceDate)
    return
  }

  process.stderr.write(`[fulcrum log] Connected to ${url}\n`)

  // Use EventSource-compatible streaming via fetch
  const ctrl = new AbortController()
  process.on('SIGINT', () => ctrl.abort())
  process.on('SIGTERM', () => ctrl.abort())

  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'text/event-stream' },
    })

    if (!res.ok || !res.body) {
      process.stderr.write(`[fulcrum log] SSE connect failed: ${res.status}\n`)
      process.exit(1)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''

    while (true) {
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
          // End of SSE event
          try {
            const evt = JSON.parse(dataLine) as FulcrumEvent & { run_id?: string }
            if (!eventMatchesRun(evt, runId)) { dataLine = ''; continue }
            if (sinceDate && new Date(evt.ts) < sinceDate) { dataLine = ''; continue }
            console.log(formatEvent(evt))
          } catch { /* skip malformed */ }
          dataLine = ''
        }
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      process.stderr.write(`[fulcrum log] SSE error: ${(err as Error).message}\n`)
    }
  }
}

// ── DB poll (fallback for --follow when monitor is down) ──────────────────────

async function pollDb(runId?: string, sinceDate?: Date): Promise<void> {
  const { getDb, runMigrations } = await import('fulcrum-agent-core')
  const db = getDb()
  runMigrations(db)

  let lastEventId = 0
  const since = sinceDate?.toISOString() ?? new Date(Date.now() - 60_000).toISOString()

  // Initial burst
  await printDbEvents(db, runId, since, lastEventId, ref => { lastEventId = ref })

  // Poll loop
  const interval = setInterval(async () => {
    await printDbEvents(db, runId, undefined, lastEventId, ref => { lastEventId = ref })
  }, 2000)

  await new Promise<void>(resolve => {
    process.once('SIGINT', () => { clearInterval(interval); resolve() })
    process.once('SIGTERM', () => { clearInterval(interval); resolve() })
  })
}

async function printDbEvents(
  db: ReturnType<typeof import('fulcrum-agent-core').getDb>,
  runId: string | undefined,
  since: string | undefined,
  afterId: number,
  updateId: (id: number) => void,
): Promise<void> {
  let query = 'SELECT * FROM events WHERE rowid > ?'
  const params: (string | number)[] = [afterId]
  if (runId) {
    query += ` AND (object_id = ? OR json_extract(payload, '$.run_id') = ?)`
    params.push(runId, runId)
  }
  if (since) { query += ' AND ts >= ?'; params.push(since) }
  query += ' ORDER BY rowid ASC LIMIT 100'

  const rows = db.prepare(query).all(...params) as (FulcrumEvent & { rowid: number })[]
  for (const row of rows) {
    const evt = { ...row, payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload }
    console.log(formatEvent(evt as FulcrumEvent))
    if (row.rowid > afterId) updateId(row.rowid)
  }
}

// ── DB read (non-follow) ──────────────────────────────────────────────────────

async function readFromDb(limit: number, runId?: string, sinceDate?: Date): Promise<void> {
  const { getDb, runMigrations } = await import('fulcrum-agent-core')
  const db = getDb()
  runMigrations(db)

  let query = 'SELECT * FROM events'
  const params: (string | number)[] = []
  const clauses: string[] = []

  if (runId) {
    clauses.push(`(object_id = ? OR json_extract(payload, '$.run_id') = ?)`)
    params.push(runId, runId)
  }
  if (sinceDate) { clauses.push('ts >= ?'); params.push(sinceDate.toISOString()) }
  if (clauses.length > 0) query += ' WHERE ' + clauses.join(' AND ')
  query += ' ORDER BY ts DESC LIMIT ?'
  params.push(limit)

  const rows = [
    ...(db.prepare(query).all(...params) as (FulcrumEvent & { payload: string | Record<string, unknown> })[]),
    ...readHookEvents(db, runId, sinceDate, limit),
  ]
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, limit)
    .reverse()

  if (rows.length === 0) {
    console.log('(no events)')
    return
  }

  for (const row of rows) {
    const evt = {
      ...row,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    }
    console.log(formatEvent(evt as FulcrumEvent))
  }
}

function readHookEvents(
  db: ReturnType<typeof import('fulcrum-agent-core').getDb>,
  runId: string | undefined,
  sinceDate: Date | undefined,
  limit: number,
): Array<FulcrumEvent & { payload: Record<string, unknown> }> {
  let query = 'SELECT * FROM hook_events'
  const params: (string | number)[] = []
  const clauses: string[] = []
  if (runId) { clauses.push('run_id = ?'); params.push(runId) }
  if (sinceDate) { clauses.push('ts >= ?'); params.push(sinceDate.toISOString()) }
  if (clauses.length > 0) query += ' WHERE ' + clauses.join(' AND ')
  query += ' ORDER BY ts DESC LIMIT ?'
  params.push(limit)

  const rows = db.prepare(query).all(...params) as Array<{
    hook_event_id: string
    workspace_id: string
    session_id: string
    tool_name: string
    agent_role: string
    run_id: string | null
    ts: string
    cli_name: string
  }>

  return rows.map(row => ({
    evt_id: row.hook_event_id,
    workspace_id: row.workspace_id,
    project_id: null,
    evt_type: 'hook_executed',
    ts: row.ts,
    object_type: 'hook_event',
    object_id: row.hook_event_id,
    actor_type: 'agent',
    actor_id: row.agent_role || 'unknown',
    payload: {
      session_id: row.session_id,
      tool_name: row.tool_name,
      role: row.agent_role,
      run_id: row.run_id ?? undefined,
      cli_name: row.cli_name,
    },
    severity: 'info',
    trace_id: null,
    span_id: null,
    correlation_id: null,
  }))
}
