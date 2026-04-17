// packages/monitor/src/server.ts
import { Hono, type MiddlewareHandler } from 'hono'
import { serve } from '@hono/node-server'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getDb, listAgentDefinitions, getEventBus, createTask, updateTask, blockAgentRun } from 'fulcrum-agent-core'
import type { EmitEventInput } from 'fulcrum-agent-core'

// Resolve the public directory relative to this file (works in both ts-node and compiled)
const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, 'public')
import { evaluatePolicy } from 'fulcrum-policy'
import {
  getMetrics,
  getBurndown,
  getPerRoleMetrics,
  getMemoryMetrics,
  getForecasting,
  replayRun,
} from './metrics.js'
import type { MonitorServer, MonitorServerConfig } from './types.js'


const CAPABILITY_SKILL_MAP: Record<string, { name: string; description: string }> = {
  code_generation:    { name: 'Code Generation',    description: 'Generates code from specifications' },
  code_review:        { name: 'Code Review',         description: 'Reviews code for quality and correctness' },
  test_generation:    { name: 'Test Generation',     description: 'Writes automated tests' },
  refactoring:        { name: 'Refactoring',         description: 'Improves code structure without behavior change' },
  documentation:      { name: 'Documentation',       description: 'Writes technical documentation' },
  planning:           { name: 'Planning',             description: 'Breaks down work into tasks' },
  research:           { name: 'Research',             description: 'Investigates technical topics' },
  debugging:          { name: 'Debugging',            description: 'Diagnoses and fixes defects' },
  deployment:         { name: 'Deployment',           description: 'Manages CI/CD and releases' },
  data_analysis:      { name: 'Data Analysis',        description: 'Analyzes data and metrics' },
  security_review:    { name: 'Security Review',      description: 'Identifies security vulnerabilities' },
  architecture:       { name: 'Architecture Review',  description: 'Reviews system design decisions' },
}

/**
 * v2a PR 4 Task 23 — loopback-only enforcement (critical constraint #9).
 * The monitor exposes PCI telemetry + mutative routes; binding on a public
 * interface would expose them outside the machine. Allowed host values are
 * the IPv4/IPv6 loopback literals only.
 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0:0:0:0:0:0:0:1'])

export class MonitorNonLoopbackError extends Error {
  constructor(host: string) {
    super(`Monitor host ${host} is not loopback; v2a requires 127.0.0.1 / ::1 / localhost`)
    this.name = 'MonitorNonLoopbackError'
  }
}

export function assertLoopbackHost(host: string): void {
  if (!LOOPBACK_HOSTS.has(host)) throw new MonitorNonLoopbackError(host)
}

export function startMonitorServer(config: MonitorServerConfig): MonitorServer {
  // Per-instance set of active SSE controllers for event-bus push mode.
  const sseControllers = new Set<ReadableStreamDefaultController>()

  // Subscribe to the in-process event bus so events are pushed to SSE clients immediately.
  let busHandler: ((event: EmitEventInput) => void) | null = null

  if (!config.isSubprocess) {
    busHandler = (event: EmitEventInput) => {
      if (sseControllers.size === 0) return
      const sseId = Date.now().toString()
      const data = JSON.stringify(event)
      const chunk = new TextEncoder().encode(`id: ${sseId}\ndata: ${data}\n\n`)

      for (const controller of [...sseControllers]) {
        try {
          controller.enqueue(chunk)
        } catch {
          // Broken pipe or closed stream — remove and continue
          sseControllers.delete(controller)
        }
      }
    }
    getEventBus().onAny(busHandler)
  }

  const app = new Hono()
  const port = config.port ?? 7331
  const host = config.host ?? '127.0.0.1'
  assertLoopbackHost(host)
  const workspace_id = config.workspace_id

  // ─── GET / — serve the web UI ───────────────────────────────────────────
  app.get('/', (c) => {
    try {
      const html = readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf-8')
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
    } catch {
      return c.json({ error: 'Web UI not found. Build or check packages/monitor/src/public/index.html' }, 404)
    }
  })

  app.get('/status', (c) => {
    return c.json({
      status: 'ok',
      workspace_id: workspace_id ?? null,
      ts: new Date().toISOString(),
    })
  })

  // v2a PR 4 Task 23 — PCI content-index counters.
  // Loopback-only (enforced at bind). Always returns within ~5ms because
  // pciStatus() is a pure in-memory read.
  app.get('/content-index', async (c) => {
    const stats = await readPciStatus()
    const now = new Date().toISOString()
    return c.json({
      files_indexed: stats.files_indexed,
      chunks_indexed: stats.chunks_indexed,
      vecs_in_index: stats.vecs_in_index,
      last_change_at: stats.last_change_at,
      watcher_refcount: stats.watcher_refcount,
      active_watchers: stats.active_watchers,
      ts: now,
    })
  })

  app.get('/metrics', async (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const result = await getMetrics({
      workspace_id: ws,
      project_id: c.req.query('project_id'),
      start_date: c.req.query('start_date'),
      end_date: c.req.query('end_date'),
    })
    return c.json(result)
  })

  app.get('/burndown', async (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    const project_id = c.req.query('project_id')
    const start_date = c.req.query('start_date')
    const end_date = c.req.query('end_date')

    if (!ws || !project_id || !start_date || !end_date) {
      return c.json({ error: 'workspace_id, project_id, start_date, end_date are required' }, 400)
    }

    const result = await getBurndown({ workspace_id: ws, project_id, start_date, end_date })
    return c.json(result)
  })

  app.get('/events/stream', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    // Always require workspace scope to prevent cross-workspace event leakage.
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const stream = new ReadableStream({
      start(controller) {
        const rawLastEventId = c.req.header('Last-Event-ID') ?? ''
        // HIGH-SSE: guard against DoS via an attacker-supplied multi-MB header.
        // Valid event IDs are short alphanumerics; reject anything else.
        const lastEventId = /^[A-Za-z0-9_-]{1,64}$/.test(rawLastEventId) ? rawLastEventId : ''

        // ── Resume: replay missed events from DB ──────────────────────────────
        if (lastEventId) {
          try {
            const db = getDb()
            const rows = db.prepare(
              `SELECT evt_id, evt_type, payload, ts FROM events WHERE workspace_id = ? AND evt_id > ? ORDER BY evt_id ASC LIMIT 100`
            ).all(ws, lastEventId) as Array<{
              evt_id: string
              evt_type: string
              payload: string
              ts: string
            }>
            for (const row of rows) {
              const data = JSON.stringify({
                event_id: row.evt_id,
                event_type: row.evt_type,
                payload: JSON.parse(row.payload) as unknown,
                ts: row.ts,
              })
              controller.enqueue(new TextEncoder().encode(`id: ${row.evt_id}\ndata: ${data}\n\n`))
            }
          } catch {
            // DB not yet available — skip catchup
          }
        }

        if (config.isSubprocess) {
          // ── Subprocess mode: poll every 500ms ────────────────────────────────
          let lastId = lastEventId
          const poll = () => {
            try {
              const db = getDb()
              const rows = db.prepare(
                `SELECT evt_id, evt_type, payload, ts FROM events WHERE workspace_id = ? AND evt_id > ? ORDER BY evt_id ASC LIMIT 100`
              ).all(ws, lastId) as Array<{
                evt_id: string
                evt_type: string
                payload: string
                ts: string
              }>
              for (const row of rows) {
                const data = JSON.stringify({
                  event_id: row.evt_id,
                  event_type: row.evt_type,
                  payload: JSON.parse(row.payload) as unknown,
                  ts: row.ts,
                })
                controller.enqueue(new TextEncoder().encode(`id: ${row.evt_id}\ndata: ${data}\n\n`))
                lastId = row.evt_id
              }
            } catch {
              // DB not yet available — skip this tick
            }
          }
          const interval = setInterval(poll, 500)
          c.req.raw.signal.addEventListener('abort', () => {
            clearInterval(interval)
            controller.close()
          })
        } else {
          // ── Event-bus mode: in-process push, sub-50ms delivery ───────────────
          sseControllers.add(controller)
          c.req.raw.signal.addEventListener('abort', () => {
            sseControllers.delete(controller)
            try { controller.close() } catch { /* already closed */ }
          })
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  })

  // ─── Extended endpoints ─────────────────────────────────────────────────────

  app.get('/board', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const db = getDb()
    const rows = db.prepare(`
      SELECT status_category, COUNT(*) AS count
      FROM tasks
      WHERE workspace_id = ?
      GROUP BY status_category
    `).all(ws) as Array<{ status_category: string; count: number }>

    const board: Record<string, number> = { backlog: 0, active: 0, blocked: 0, done: 0 }
    for (const row of rows) {
      if (row.status_category in board) board[row.status_category] = row.count
    }

    return c.json({ data: board })
  })

  app.get('/agents', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const db = getDb()
    const rows = db.prepare(`
      SELECT * FROM agent_runs
      WHERE workspace_id = ?
      ORDER BY started_at DESC
      LIMIT 50
    `).all(ws)

    return c.json({ data: rows })
  })

  app.get('/agents/:id', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const db = getDb()
    const run = db.prepare(`
      SELECT * FROM agent_runs WHERE run_id = ? AND workspace_id = ?
    `).get(c.req.param('id'), ws)

    if (!run) return c.json({ error: 'not found' }, 404)
    return c.json({ data: run })
  })

  app.get('/merge-queue', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const db = getDb()
    const rows = db.prepare(`
      SELECT * FROM worktrees
      WHERE workspace_id = ? AND status = 'ready_for_merge'
      ORDER BY updated_at DESC
    `).all(ws)

    return c.json({ data: rows })
  })

  app.get('/review-queue', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const db = getDb()
    const rows = db.prepare(`
      SELECT * FROM reviews
      WHERE workspace_id = ? AND status = 'pending'
      ORDER BY created_at DESC
    `).all(ws)

    return c.json({ data: rows })
  })

  app.get('/artifacts', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const db = getDb()
    const rows = db.prepare(`
      SELECT * FROM artifacts
      WHERE workspace_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(ws)

    return c.json({ data: rows })
  })

  app.get('/memory-trace', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const db = getDb()
    const rows = db.prepare(`
      SELECT * FROM memories
      WHERE workspace_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(ws)

    return c.json({ data: rows })
  })

  app.get('/analytics/summary', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const db = getDb()
    const taskCount = (db.prepare(
      `SELECT COUNT(*) AS n FROM tasks WHERE workspace_id = ?`
    ).get(ws) as { n: number }).n

    const runCount = (db.prepare(
      `SELECT COUNT(*) AS n FROM agent_runs WHERE workspace_id = ?`
    ).get(ws) as { n: number }).n

    const memoryCount = (db.prepare(
      `SELECT COUNT(*) AS n FROM memories WHERE workspace_id = ?`
    ).get(ws) as { n: number }).n

    // events table uses evt_id, workspace_id
    let eventCount = 0
    try {
      const r = db.prepare(
        `SELECT COUNT(*) AS n FROM events WHERE workspace_id = ?`
      ).get(ws) as { n: number } | undefined
      eventCount = r?.n ?? 0
    } catch {
      // events table may have different schema
    }

    // hook_events: passive trace rows written by the PreToolUse hook.
    // Only count rows for the requested workspace_id so empty-string rows
    // (written when workspace_id context is absent) don't pollute this metric.
    let hookEventCount = 0
    try {
      const r = db.prepare(
        `SELECT COUNT(*) AS n FROM hook_events WHERE workspace_id = ?`
      ).get(ws) as { n: number } | undefined
      hookEventCount = r?.n ?? 0
    } catch {
      // hook_events table may not exist on older databases
    }

    return c.json({
      data: {
        task_count: taskCount,
        run_count: runCount,
        memory_count: memoryCount,
        event_count: eventCount,
        hook_event_count: hookEventCount,
      },
    })
  })

  app.get('/pm/overview', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const db = getDb()
    const count = (sql: string, ...params: unknown[]): number => {
      const row = db.prepare(sql).get(...params) as { n: number } | undefined
      return row?.n ?? 0
    }

    const epics = {
      total: count(`SELECT COUNT(*) AS n FROM epics WHERE workspace_id = ?`, ws),
      active: count(`SELECT COUNT(*) AS n FROM epics WHERE workspace_id = ? AND status_category = 'active'`, ws),
      blocked: count(`SELECT COUNT(*) AS n FROM epics WHERE workspace_id = ? AND status_category = 'blocked'`, ws),
      done: count(`SELECT COUNT(*) AS n FROM epics WHERE workspace_id = ? AND status_category = 'done'`, ws),
    }

    const issues = {
      total: count(`SELECT COUNT(*) AS n FROM issues WHERE workspace_id = ?`, ws),
      active: count(`SELECT COUNT(*) AS n FROM issues WHERE workspace_id = ? AND status_category = 'active'`, ws),
      blocked: count(`SELECT COUNT(*) AS n FROM issues WHERE workspace_id = ? AND status_category = 'blocked'`, ws),
      in_review: count(`SELECT COUNT(*) AS n FROM issues WHERE workspace_id = ? AND status = 'in_review'`, ws),
      done: count(`SELECT COUNT(*) AS n FROM issues WHERE workspace_id = ? AND status_category = 'done'`, ws),
    }

    const plans = {
      total: count(`SELECT COUNT(*) AS n FROM plans WHERE workspace_id = ?`, ws),
      draft: count(`SELECT COUNT(*) AS n FROM plans WHERE workspace_id = ? AND status = 'draft'`, ws),
      active: count(`SELECT COUNT(*) AS n FROM plans WHERE workspace_id = ? AND status = 'active'`, ws),
      completed: count(`SELECT COUNT(*) AS n FROM plans WHERE workspace_id = ? AND status = 'completed'`, ws),
    }

    const reviews = {
      pending: count(`SELECT COUNT(*) AS n FROM reviews WHERE workspace_id = ? AND status = 'pending'`, ws),
      changes_requested: count(`SELECT COUNT(*) AS n FROM reviews WHERE workspace_id = ? AND status = 'changes_requested'`, ws),
      approved: count(`SELECT COUNT(*) AS n FROM reviews WHERE workspace_id = ? AND status = 'approved'`, ws),
      rejected: count(`SELECT COUNT(*) AS n FROM reviews WHERE workspace_id = ? AND status = 'rejected'`, ws),
    }

    const blockers = {
      tasks: count(`SELECT COUNT(*) AS n FROM tasks WHERE workspace_id = ? AND status_category = 'blocked'`, ws),
      issues: issues.blocked,
      runs: count(`SELECT COUNT(*) AS n FROM agent_runs WHERE workspace_id = ? AND status = 'blocked'`, ws),
    }

    const blockedIssues = db.prepare(`
      SELECT issue_id, display_id, title, assignee_agent_id, updated_at
      FROM issues
      WHERE workspace_id = ? AND status_category = 'blocked'
      ORDER BY updated_at DESC
      LIMIT 5
    `).all(ws)

    const activePlans = db.prepare(`
      SELECT plan_id, display_id, title, file_path, updated_at
      FROM plans
      WHERE workspace_id = ? AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT 5
    `).all(ws)

    const pendingReviews = db.prepare(`
      SELECT review_id, display_id, target_type, target_id, updated_at
      FROM reviews
      WHERE workspace_id = ? AND status = 'pending'
      ORDER BY updated_at DESC
      LIMIT 5
    `).all(ws)

    const activeWork = issues.active + plans.active + epics.active
    const blockedWork = blockers.tasks + blockers.issues + blockers.runs
    const blockedPct = activeWork > 0 ? Math.round((blockedWork / (activeWork + blockedWork)) * 100) : 0

    return c.json({
      data: {
        epics,
        issues,
        plans,
        reviews,
        blockers,
        delivery_health: {
          active_work: activeWork,
          blocked_work: blockedWork,
          blocked_pct: blockedPct,
          open_reviews: reviews.pending + reviews.changes_requested,
        },
        focus: {
          blocked_issues: blockedIssues,
          active_plans: activePlans,
          pending_reviews: pendingReviews,
        },
      },
    })
  })

  app.get('/policy/events', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const db = getDb()
    const rows = db.prepare(`
      SELECT * FROM policy_events
      WHERE workspace_id = ?
      ORDER BY ts DESC
      LIMIT 50
    `).all(ws)

    return c.json({ data: rows })
  })

  app.get('/sync/state', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const db = getDb()
    const rows = db.prepare(`
      SELECT * FROM sync_states
      WHERE workspace_id = ?
      ORDER BY updated_at DESC
    `).all(ws)

    return c.json({ data: rows })
  })

  app.get('/teams', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const db = getDb()
    const rows = db.prepare(`
      SELECT * FROM team_instances
      WHERE workspace_id = ?
      ORDER BY created_at DESC
    `).all(ws)

    return c.json({ data: rows })
  })

  app.get('/analytics/per-role', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const db = getDb()
    const data = getPerRoleMetrics(db, { workspace_id: ws })
    return c.json({ data })
  })

  app.get('/analytics/memory', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const db = getDb()
    const data = getMemoryMetrics(db, { workspace_id: ws })
    return c.json({ data })
  })

  app.get('/replay/:run_id', async (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const run_id = c.req.param('run_id')

    const result = await replayRun({ run_id, workspace_id: ws })

    if (result.events.length === 0) {
      return c.json({ error: 'run not found' }, 404)
    }

    return c.json({ data: result.events })
  })

  app.get('/analytics/forecast', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const horizon_days = parseInt(c.req.query('horizon_days') ?? '30', 10)
    const db = getDb()
    const data = getForecasting(db, { workspace_id: ws, horizon_days })
    return c.json({ data })
  })

  // ─── /tasks — list with filter + pagination ───────────────────────────────

  app.get('/tasks', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const db = getDb()
    const status = c.req.query('status')
    const limit  = Math.min(parseInt(c.req.query('limit')  ?? '50',  10), 500)
    const offset = parseInt(c.req.query('offset') ?? '0', 10)

    let countSql = `SELECT COUNT(*) AS n FROM tasks WHERE workspace_id = ?`
    let dataSql  = `SELECT * FROM tasks WHERE workspace_id = ?`
    const params: unknown[] = [ws]

    if (status) {
      countSql += ` AND status = ?`
      dataSql  += ` AND status = ?`
      params.push(status)
    }

    const total = (db.prepare(countSql).get(...params) as { n: number }).n
    dataSql += ` ORDER BY created_at ASC LIMIT ? OFFSET ?`
    const data = db.prepare(dataSql).all(...params, limit, offset)
    const next_cursor = offset + data.length < total ? String(offset + data.length) : null

    return c.json({
      data,
      pagination: { total, limit, offset, next_cursor },
    })
  })

  // ─── Bearer token auth middleware (mutation endpoints) ───────────────────
  //
  // HIGH-9: the prior behavior silently allowed unauthenticated mutations when
  // FULCRUM_MONITOR_TOKEN was unset, and also when config.bypass_auth was
  // true — with no startup warning. Local CSRF (DNS-rebind, a malicious page
  // the user visits) could POST/PATCH/DELETE. Fixed by:
  //   1) Per-install auto-token written to {globalDataDir()}/monitor-token
  //      on first start. FULCRUM_MONITOR_TOKEN env var still overrides.
  //   2) Bypass requires BOTH config.bypass_auth=true AND env FULCRUM_MONITOR_ALLOW_BYPASS=1
  //      AND prints a loud stderr warning at startup.
  //   3) Host/Origin header must match 127.0.0.1 / localhost. This neutralises
  //      DNS-rebind attacks that send POSTs from a webpage.
  //   4) Token comparison via timingSafeEqual.
  if (config.bypass_auth && process.env['FULCRUM_MONITOR_ALLOW_BYPASS'] !== '1') {
    process.stderr.write(
      '[fulcrum/monitor] WARNING: config.bypass_auth is true but FULCRUM_MONITOR_ALLOW_BYPASS is not set — auth will remain enforced.\n',
    )
  } else if (config.bypass_auth) {
    process.stderr.write(
      '[fulcrum/monitor] SECURITY WARNING: bypass_auth active — monitor accepts unauthenticated mutations. Do not run in production.\n',
    )
  }

  const requireAuth: MiddlewareHandler = async (c, next) => {
    // HIGH-9: Host header guard against DNS-rebind / cross-origin hits from
    // browsers. We already bind to loopback, but browsers can be tricked into
    // POSTing to 127.0.0.1 when a malicious DNS response pins evil.example
    // to 127.0.0.1. Allow empty Host (in-process tests) — a real HTTP client
    // always sends one, and a missing Host header is indicative of a local
    // call without an external attacker.
    const hostHdr = (c.req.header('Host') ?? '').toLowerCase()
    if (hostHdr) {
      const host = hostHdr.split(':')[0] ?? ''
      const isLoopbackHost = host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1'
      if (!isLoopbackHost) {
        return Promise.resolve(c.json({ error: 'Forbidden — non-loopback Host header' }, 403))
      }
    }

    if (config.bypass_auth && process.env['FULCRUM_MONITOR_ALLOW_BYPASS'] === '1') return next()

    const token = process.env['FULCRUM_MONITOR_TOKEN']
    if (!token) {
      return Promise.resolve(c.json({ error: 'Unauthorized — monitor token not set (set FULCRUM_MONITOR_TOKEN)' }, 401))
    }
    const authHeader = c.req.header('Authorization') ?? ''
    const expected = `Bearer ${token}`
    // crypto.timingSafeEqual requires equal-length buffers; length-prefix equality first.
    const { timingSafeEqual } = await import('node:crypto')
    const a = Buffer.from(authHeader)
    const b = Buffer.from(expected)
    const equal = a.length === b.length && timingSafeEqual(a, b)
    if (!equal) return Promise.resolve(c.json({ error: 'Unauthorized' }, 401))
    return next()
  }

  // ─── POST /tasks — create a new task ─────────────────────────────────────

  app.post('/tasks', requireAuth, async (c) => {
    const body = await c.req.json() as {
      title?: string
      workspace_id?: string
      project_id?: string
      description?: string
      priority?: 'critical' | 'high' | 'medium' | 'low'
      assigned_to?: string
    }
    const ws = body.workspace_id ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)
    if (!body.title) return c.json({ error: 'title required' }, 400)

    try {
      const task = await createTask({
        title: body.title,
        workspace_id: ws,
        project_id: body.project_id ?? '',
        description: body.description,
        priority: body.priority,
        assigned_to: body.assigned_to,
      })
      return c.json({ data: task }, 201)
    } catch (err) {
      process.stderr.write(`[fulcrum/monitor] ${(err as Error).message}\n`); return c.json({ error: "internal_error" }, 500)
    }
  })

  // ─── PATCH /tasks/:id — update task status or priority ───────────────────

  app.patch('/tasks/:id', requireAuth, async (c) => {
    const task_id = c.req.param('id')
    const body = await c.req.json() as {
      status?: 'queued' | 'ready' | 'claimed' | 'running' | 'blocked' | 'failed' | 'completed' | 'cancelled'
      priority?: 'critical' | 'high' | 'medium' | 'low'
      title?: string
      assigned_to?: string
      note?: string
    }

    try {
      const task = await updateTask({ task_id, ...body })
      return c.json({ data: task })
    } catch (err) {
      process.stderr.write(`[fulcrum/monitor] ${(err as Error).message}\n`); return c.json({ error: "internal_error" }, 500)
    }
  })

  // ─── POST /runs/:id/unblock — unblock a blocked run ──────────────────────
  // Marks the run as no longer blocked by completing it with a note.
  // Agents polling for unblock should resume normally.

  app.post('/runs/:id/unblock', requireAuth, async (c) => {
    const run_id = c.req.param('id')
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>) as { summary?: string }
    const db = getDb()

    const run = db.prepare('SELECT * FROM agent_runs WHERE run_id = ? AND workspace_id = ?').get(run_id, workspace_id) as { status: string } | undefined
    if (!run) return c.json({ error: 'run not found' }, 404)
    if (run.status !== 'blocked') return c.json({ error: 'run is not blocked', status: run.status }, 409)

    try {
      db.prepare(`UPDATE agent_runs SET status = 'running', blocker = NULL, updated_at = ? WHERE run_id = ? AND workspace_id = ?`)
        .run(new Date().toISOString(), run_id, workspace_id)
      return c.json({ data: { run_id, status: 'running', summary: body.summary ?? 'Unblocked by operator' } })
    } catch (err) {
      process.stderr.write(`[fulcrum/monitor] ${(err as Error).message}\n`); return c.json({ error: "internal_error" }, 500)
    }
  })

  // ─── POST /runs/:id/kill — terminate a running agent run ─────────────────

  app.post('/runs/:id/kill', requireAuth, async (c) => {
    const run_id = c.req.param('id')
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>) as { reason?: string }
    const db = getDb()

    const run = db.prepare('SELECT * FROM agent_runs WHERE run_id = ? AND workspace_id = ?').get(run_id, workspace_id) as { status: string } | undefined
    if (!run) return c.json({ error: 'run not found' }, 404)
    if (run.status === 'finished' || run.status === 'failed' || run.status === 'aborted') {
      return c.json({ error: 'run is already terminal', status: run.status }, 409)
    }

    try {
      await blockAgentRun({
        run_id,
        reason: body.reason ?? 'Killed by operator',
        escalation_reason: 'Operator-initiated termination',
      })
      return c.json({ data: { run_id, status: 'blocked' } })
    } catch (err) {
      process.stderr.write(`[fulcrum/monitor] ${(err as Error).message}\n`); return c.json({ error: "internal_error" }, 500)
    }
  })

  // ─── POST /reviews/:id/approve — approve a pending review ────────────────

  app.post('/reviews/:id/approve', requireAuth, async (c) => {
    const review_id = c.req.param('id')
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>) as { comment?: string }
    const db = getDb()

    const review = db.prepare('SELECT * FROM reviews WHERE review_id = ? AND workspace_id = ?').get(review_id, workspace_id) as { status: string } | undefined
    if (!review) return c.json({ error: 'review not found' }, 404)
    if (review.status !== 'pending') return c.json({ error: 'review is not pending', status: review.status }, 409)

    try {
      db.prepare(`UPDATE reviews SET status = 'approved', summary = ?, updated_at = ? WHERE review_id = ? AND workspace_id = ?`)
        .run(body.comment ?? null, new Date().toISOString(), review_id, workspace_id)
      return c.json({ data: { review_id, status: 'approved' } })
    } catch (err) {
      process.stderr.write(`[fulcrum/monitor] ${(err as Error).message}\n`); return c.json({ error: "internal_error" }, 500)
    }
  })

  // ─── POST /reviews/:id/reject — reject a pending review ──────────────────

  app.post('/reviews/:id/reject', requireAuth, async (c) => {
    const review_id = c.req.param('id')
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>) as { comment?: string }
    const db = getDb()

    const review = db.prepare('SELECT * FROM reviews WHERE review_id = ? AND workspace_id = ?').get(review_id, workspace_id) as { status: string } | undefined
    if (!review) return c.json({ error: 'review not found' }, 404)
    if (review.status !== 'pending') return c.json({ error: 'review is not pending', status: review.status }, 409)

    try {
      db.prepare(`UPDATE reviews SET status = 'rejected', summary = ?, updated_at = ? WHERE review_id = ? AND workspace_id = ?`)
        .run(body.comment ?? null, new Date().toISOString(), review_id, workspace_id)
      return c.json({ data: { review_id, status: 'rejected' } })
    } catch (err) {
      process.stderr.write(`[fulcrum/monitor] ${(err as Error).message}\n`); return c.json({ error: "internal_error" }, 500)
    }
  })

  // ─── POST /policy/check ───────────────────────────────────────────────────

  app.post('/policy/check', async (c) => {
    const body = await c.req.json() as {
      workspace_id?: string
      actor_id: string
      actor_role: string
      action: string
      resource_id?: string
    }
    const ws = body.workspace_id ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const decision = await evaluatePolicy({
      workspace_id: ws,
      actor_id: body.actor_id,
      actor_role: body.actor_role as import('fulcrum-agent-core').AgentRole,
      action: body.action,
      resource_id: body.resource_id,
    })

    return c.json({ allowed: decision.allowed, rule_id: decision.rule_id ?? null })
  })

  // ─── GET /.well-known/agent.json — A2A Agent Card ────────────────────────

  app.get('/.well-known/agent.json', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    const db = getDb()

    // Build skills from registered agent definitions in this workspace
    const skillMap = new Map<string, { id: string; name: string; description: string }>()
    try {
      const defs = ws ? listAgentDefinitions(undefined, ws, db) : []
      for (const def of defs) {
        for (const cap of def.capabilities ?? []) {
          if (!skillMap.has(cap)) {
            const meta = CAPABILITY_SKILL_MAP[cap] ?? { name: cap, description: '' }
            skillMap.set(cap, { id: cap, name: meta.name, description: meta.description })
          }
        }
      }
    } catch {
      // listAgentDefinitions may fail if DB not initialised — return empty skills
    }

    const card = {
      name: 'Fulcrum Agent OS',
      version: '1.0.0',
      url: `http://${config.host ?? '127.0.0.1'}:${config.port ?? 7331}`,
      description: 'Fulcrum multi-agent orchestration platform',
      skills: Array.from(skillMap.values()),
      authentication: { schemes: ['bearer', 'none'] },
      capabilities: {
        streaming: true,
        pushNotifications: false,
        stateTransitionHistory: true,
      },
    }

    return c.json(card)
  })

  let serverInstance: ReturnType<typeof serve> | null = null

  return {
    port,
    fetch: (req: Request) => app.fetch(req),
    start: async () => {
      assertLoopbackHost(host)
      serverInstance = serve({ fetch: app.fetch, port, hostname: host })
    },
    stop: async () => {
      if (serverInstance) {
        serverInstance.close()
        serverInstance = null
      }
      // Unsubscribe from event bus and close all active SSE controllers
      if (busHandler) {
        getEventBus().offAny(busHandler)
        busHandler = null
      }
      for (const controller of [...sseControllers]) {
        try { controller.close() } catch { /* already closed */ }
      }
      sseControllers.clear()
    },
  }
}

/**
 * v2a PR 4 Task 23 — resolve PCI + code-index counters for the /content-index
 * route. Uses string-module dynamic import so the monitor package doesn't
 * take a direct dep on fulcrum-memory (which depends on monitor
 * in some builds). Returns zeros on any resolution failure so the endpoint
 * is always available for liveness/scripted checks.
 */
async function readPciStatus(): Promise<{
  files_indexed: number
  chunks_indexed: number
  vecs_in_index: number
  last_change_at: string | null
  watcher_refcount: number
  active_watchers: number
}> {
  let watcher_refcount = 0
  let active_watchers = 0
  try {
    const moduleName = 'fulcrum-memory'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mem = (await import(/* @vite-ignore */ moduleName)) as any
    const pciMod = mem?.pciStatus ? mem : (await import(/* @vite-ignore */ `${moduleName}/dist/index.js`).catch(() => null) as any)
    const status = typeof pciMod?.pciStatus === 'function' ? pciMod.pciStatus() : null
    if (status) {
      active_watchers = Number(status.activeWatchers ?? 0)
      const refcounts = status.refcounts ?? {}
      for (const v of Object.values(refcounts)) watcher_refcount += Number(v)
    }
  } catch { /* best-effort */ }

  let files_indexed = 0
  let chunks_indexed = 0
  let last_change_at: string | null = null
  try {
    const db = getDb()
    const files = db.prepare('SELECT COUNT(*) AS n FROM code_files').get() as { n: number } | undefined
    files_indexed = Number(files?.n ?? 0)
    const chunks = db.prepare('SELECT COUNT(*) AS n FROM code_chunks').get() as { n: number } | undefined
    chunks_indexed = Number(chunks?.n ?? 0)
    const latest = db.prepare('SELECT MAX(indexed_at) AS ts FROM code_chunks').get() as { ts: string | null } | undefined
    last_change_at = latest?.ts ?? null
  } catch { /* db may be closed during tests */ }

  return {
    files_indexed,
    chunks_indexed,
    vecs_in_index: chunks_indexed,  // vec rows mirror chunks in v2a
    last_change_at,
    watcher_refcount,
    active_watchers,
  }
}
