// packages/monitor/src/server.ts
import { Hono, type MiddlewareHandler } from 'hono'
import { serve } from '@hono/node-server'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  getDb,
  listAgentDefinitions,
  getEventBus,
  createTask,
  updateTask,
  startAgentRun,
  heartbeatAgentRun,
  completeAgentRun,
  blockAgentRun,
  unblockAgentRun,
  abortAgentRun,
  buildCosContext,
  checkPolicy,
  loadConfig,
} from 'fulcrum-agent-core'
import type { AgentRole, EmitEventInput, MemoryKind, MemoryScope } from 'fulcrum-agent-core'
import { recallMemory, writeMemory } from 'fulcrum-memory'

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

function sseChunk(event: {
  evt_id?: string
  event_id?: string
  evt_type: string
  ts?: string
  created_at?: string
  payload?: unknown
}): Uint8Array {
  const eventId = event.event_id ?? event.evt_id ?? Date.now().toString()
  const ts = event.created_at ?? event.ts ?? new Date().toISOString()
  const data = JSON.stringify({
    ...event,
    evt_id: eventId,
    event_id: eventId,
    event_type: event.evt_type,
    ts,
    created_at: ts,
  })
  return new TextEncoder().encode(`id: ${eventId}\ndata: ${data}\n\n`)
}

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
const DEFAULT_PAGE_LIMIT = 50
const MAX_PAGE_LIMIT = 200

export class MonitorNonLoopbackError extends Error {
  constructor(host: string) {
    super(`Monitor host ${host} is not loopback; v2a requires 127.0.0.1 / ::1 / localhost`)
    this.name = 'MonitorNonLoopbackError'
  }
}

export function assertLoopbackHost(host: string): void {
  if (!LOOPBACK_HOSTS.has(host)) throw new MonitorNonLoopbackError(host)
}

function readPagination(query: (name: string) => string | undefined): { limit: number; offset: number } {
  const rawLimit = Number.parseInt(query('limit') ?? String(DEFAULT_PAGE_LIMIT), 10)
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT)

  const rawOffset = Number.parseInt(query('cursor') ?? query('offset') ?? '0', 10)
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0)
  return { limit, offset }
}

function paginated<T>(data: T[], total: number, limit: number, offset: number): {
  data: T[]
  pagination: { total: number; limit: number; offset: number; next_cursor: string | null }
} {
  const nextOffset = offset + data.length
  return {
    data,
    pagination: {
      total,
      limit,
      offset,
      next_cursor: nextOffset < total ? String(nextOffset) : null,
    },
  }
}

function statusForError(err: unknown): 400 | 403 | 404 | 409 | 500 {
  const code = (err as { code?: string }).code
  if (code === 'invalid_input') return 400
  if (code === 'policy_blocked' || code === 'policy_denied') return 403
  if (code === 'not_found') return 404
  if (code === 'conflict' || code === 'invalid_state' || code === 'version_conflict') return 409
  return 500
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'internal_error'
}

function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map(v => v.trim()).filter(Boolean)
  return []
}

export function startMonitorServer(config: MonitorServerConfig): MonitorServer {
  // Per-instance set of active SSE controllers for event-bus push mode.
  const sseControllers = new Set<ReadableStreamDefaultController>()

  // Subscribe to the in-process event bus so events are pushed to SSE clients immediately.
  let busHandler: ((event: EmitEventInput) => void) | null = null

  if (!config.isSubprocess) {
    busHandler = (event: EmitEventInput) => {
      if (sseControllers.size === 0) return
      const chunk = sseChunk(event)

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
  const project_id = config.project_id

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
    const db = getDb()
    const workspace = workspace_id
      ? db.prepare(`SELECT name FROM workspaces WHERE workspace_id = ?`).get(workspace_id) as { name: string } | undefined
      : undefined
    const project = project_id
      ? db.prepare(`SELECT name FROM projects WHERE project_id = ?`).get(project_id) as { name: string } | undefined
      : undefined

    return c.json({
      status: 'ok',
      workspace_id: workspace_id ?? null,
      workspace_name: workspace?.name ?? null,
      project_id: project_id ?? null,
      project_name: project?.name ?? null,
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
              const data = sseChunk({
                evt_id: row.evt_id,
                evt_type: row.evt_type,
                payload: JSON.parse(row.payload) as unknown,
                ts: row.ts,
              })
              controller.enqueue(data)
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
                const data = sseChunk({
                  evt_id: row.evt_id,
                  evt_type: row.evt_type,
                  payload: JSON.parse(row.payload) as unknown,
                  ts: row.ts,
                })
                controller.enqueue(data)
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
    // workspace_id optional — absent means aggregate across every workspace
    // (the "All workspaces" view in the dashboard).
    const ws = c.req.query('workspace_id') ?? workspace_id
    const db = getDb()
    const rows = ws
      ? db.prepare(`SELECT status_category, COUNT(*) AS count FROM tasks WHERE workspace_id = ? GROUP BY status_category`).all(ws) as Array<{ status_category: string; count: number }>
      : db.prepare(`SELECT status_category, COUNT(*) AS count FROM tasks GROUP BY status_category`).all() as Array<{ status_category: string; count: number }>

    const board: Record<string, number> = { backlog: 0, active: 0, blocked: 0, done: 0 }
    for (const row of rows) {
      if (row.status_category in board) board[row.status_category] = row.count
    }

    return c.json({ data: board })
  })

  app.get('/agents', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    const db = getDb()
    const { limit, offset } = readPagination(c.req.query.bind(c.req))
    const total = ws
      ? (db.prepare(`SELECT COUNT(*) AS n FROM agent_runs WHERE workspace_id = ?`).get(ws) as { n: number }).n
      : (db.prepare(`SELECT COUNT(*) AS n FROM agent_runs`).get() as { n: number }).n
    const rows = ws
      ? db.prepare(`SELECT * FROM agent_runs WHERE workspace_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`).all(ws, limit, offset)
      : db.prepare(`SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT ? OFFSET ?`).all(limit, offset)
    return c.json(paginated(rows, total, limit, offset))
  })

  // ─── GET /workspaces — list workspaces with project + run counts ────────
  app.get('/workspaces', (c) => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT
        w.workspace_id,
        w.name,
        w.status,
        (SELECT COUNT(*) FROM projects    p WHERE p.workspace_id = w.workspace_id) AS project_count,
        (SELECT COUNT(*) FROM agent_runs  r WHERE r.workspace_id = w.workspace_id AND r.status = 'running') AS running_runs,
        (SELECT COUNT(*) FROM tasks       t WHERE t.workspace_id = w.workspace_id AND t.status_category = 'active') AS active_tasks
      FROM workspaces w
      ORDER BY w.name
    `).all()
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
    const { limit, offset } = readPagination(c.req.query.bind(c.req))
    const total = (db.prepare(`
      SELECT COUNT(*) AS n FROM artifacts
      WHERE workspace_id = ?
    `).get(ws) as { n: number }).n
    const rows = db.prepare(`
      SELECT * FROM artifacts
      WHERE workspace_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(ws, limit, offset)

    return c.json(paginated(rows, total, limit, offset))
  })

  app.get('/memory-trace', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const db = getDb()
    const { limit, offset } = readPagination(c.req.query.bind(c.req))
    const total = (db.prepare(`
      SELECT COUNT(*) AS n FROM memories
      WHERE workspace_id = ?
    `).get(ws) as { n: number }).n
    const rows = db.prepare(`
      SELECT * FROM memories
      WHERE workspace_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(ws, limit, offset)

    return c.json(paginated(rows, total, limit, offset))
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
    // workspace_id optional — absent means aggregate across all workspaces.
    const ws = c.req.query('workspace_id') ?? workspace_id

    const db = getDb()
    // Shared WHERE fragment. When ws is set we filter by workspace_id; when
    // omitted we include every workspace. Callers interpolate `${wsClause}`
    // and append `...wsParams` as trailing SQL bind params.
    const wsClause = ws ? `workspace_id = ?` : `1=1`
    const wsParams: unknown[] = ws ? [ws] : []
    const andWsClause = ws ? `AND workspace_id = ?` : ``

    const count = (sql: string, ...params: unknown[]): number => {
      const row = db.prepare(sql).get(...params) as { n: number } | undefined
      return row?.n ?? 0
    }

    const epics = {
      total:   count(`SELECT COUNT(*) AS n FROM epics WHERE ${wsClause}`, ...wsParams),
      active:  count(`SELECT COUNT(*) AS n FROM epics WHERE status_category = 'active'  ${andWsClause}`, ...wsParams),
      blocked: count(`SELECT COUNT(*) AS n FROM epics WHERE status_category = 'blocked' ${andWsClause}`, ...wsParams),
      done:    count(`SELECT COUNT(*) AS n FROM epics WHERE status_category = 'done'    ${andWsClause}`, ...wsParams),
    }

    const issues = {
      total:     count(`SELECT COUNT(*) AS n FROM issues WHERE ${wsClause}`, ...wsParams),
      active:    count(`SELECT COUNT(*) AS n FROM issues WHERE status_category = 'active'  ${andWsClause}`, ...wsParams),
      blocked:   count(`SELECT COUNT(*) AS n FROM issues WHERE status_category = 'blocked' ${andWsClause}`, ...wsParams),
      in_review: count(`SELECT COUNT(*) AS n FROM issues WHERE status = 'in_review'        ${andWsClause}`, ...wsParams),
      done:      count(`SELECT COUNT(*) AS n FROM issues WHERE status_category = 'done'    ${andWsClause}`, ...wsParams),
    }

    const plans = {
      total:     count(`SELECT COUNT(*) AS n FROM plans WHERE ${wsClause}`, ...wsParams),
      draft:     count(`SELECT COUNT(*) AS n FROM plans WHERE status = 'draft'     ${andWsClause}`, ...wsParams),
      active:    count(`SELECT COUNT(*) AS n FROM plans WHERE status = 'active'    ${andWsClause}`, ...wsParams),
      completed: count(`SELECT COUNT(*) AS n FROM plans WHERE status = 'completed' ${andWsClause}`, ...wsParams),
    }

    const reviews = {
      pending:            count(`SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'            ${andWsClause}`, ...wsParams),
      changes_requested:  count(`SELECT COUNT(*) AS n FROM reviews WHERE status = 'changes_requested'  ${andWsClause}`, ...wsParams),
      approved:           count(`SELECT COUNT(*) AS n FROM reviews WHERE status = 'approved'           ${andWsClause}`, ...wsParams),
      rejected:           count(`SELECT COUNT(*) AS n FROM reviews WHERE status = 'rejected'           ${andWsClause}`, ...wsParams),
    }

    const blockers = {
      tasks:  count(`SELECT COUNT(*) AS n FROM tasks      WHERE status_category = 'blocked' ${andWsClause}`, ...wsParams),
      issues: issues.blocked,
      runs:   count(`SELECT COUNT(*) AS n FROM agent_runs WHERE status = 'blocked'          ${andWsClause}`, ...wsParams),
    }

    const blockedIssues = db.prepare(`
      SELECT issue_id, display_id, title, assignee_agent_id, updated_at
      FROM issues
      WHERE status_category = 'blocked' ${andWsClause}
      ORDER BY updated_at DESC
      LIMIT 5
    `).all(...wsParams)

    const activePlans = db.prepare(`
      SELECT plan_id, display_id, title, file_path, updated_at
      FROM plans
      WHERE status = 'active' ${andWsClause}
      ORDER BY updated_at DESC
      LIMIT 5
    `).all(...wsParams)

    const pendingReviews = db.prepare(`
      SELECT review_id, display_id, target_type, target_id, updated_at
      FROM reviews
      WHERE status = 'pending' ${andWsClause}
      ORDER BY updated_at DESC
      LIMIT 5
    `).all(...wsParams)

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
    const { limit, offset } = readPagination(c.req.query.bind(c.req))
    const total = (db.prepare(`
      SELECT COUNT(*) AS n FROM team_instances
      WHERE workspace_id = ?
    `).get(ws) as { n: number }).n
    const rows = db.prepare(`
      SELECT * FROM team_instances
      WHERE workspace_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(ws, limit, offset)

    return c.json(paginated(rows, total, limit, offset))
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

  // Memory v3 PR 8 unit 8.3 — observability surface. Counts live L1 pages by
  // retention tier, L0 ingest rate, graph nodes/edges, confidence histogram,
  // and curation latency percentiles parsed from `vault/curated/log.md`.
  app.get('/memory/stats', async (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)
    try {
      const { computeMemoryV3Stats, getVaultPath } = await import('fulcrum-memory')
      const vaultPath = c.req.query('vault_path') ?? getVaultPath()
      const db = getDb()
      const data = computeMemoryV3Stats(db, { workspace_id: ws, vaultPath })
      return c.json({ data })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  app.get('/rag/health', async (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)
    const proj = c.req.query('project_id') ?? project_id
    if (!proj) return c.json({ error: 'project_id required' }, 400)

    try {
      const { buildRagHealthReport } = await import('fulcrum-memory')
      const data = buildRagHealthReport({
        workspace_id: ws,
        project_id: proj,
        vault_path: c.req.query('vault_path'),
        runtime_profile: c.req.query('runtime_profile') as 'install' | 'dev' | 'test' | undefined,
      }, getDb())
      return c.json(data)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
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
    const { limit, offset } = readPagination(c.req.query.bind(c.req))

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
    return c.json(paginated(data, total, limit, offset))
  })

  // ─── Bearer token auth middleware (mutation endpoints) ───────────────────
  //
  // Default posture: the monitor is a local-first service bound to 127.0.0.1
  // only, with a Host-header guard that rejects non-loopback values to defeat
  // DNS-rebind / cross-origin POSTs from browsers. In that threat model a
  // Bearer token adds no meaningful security over "can you reach loopback",
  // because anything on the machine that can make the HTTP call can also
  // read the token file. Forcing a token broke every agent integration
  // (they all returned 401 on write), so auth is now OFF by default.
  //
  // Opt-in by setting FULCRUM_MONITOR_REQUIRE_AUTH=1 (or config.bypass_auth=false
  // with FULCRUM_MONITOR_TOKEN set). In that mode the server enforces the
  // Bearer token with timingSafeEqual and rejects mismatches.
  const enforceAuth = process.env['FULCRUM_MONITOR_REQUIRE_AUTH'] === '1'
    || (config.bypass_auth === false && !!process.env['FULCRUM_MONITOR_TOKEN'])

  const requireAuth: MiddlewareHandler = async (c, next) => {
    // Host-header guard runs in every mode. Binding to loopback prevents
    // remote hits; the header check additionally neutralises DNS-rebind
    // attacks where a malicious page resolves to 127.0.0.1 and POSTs.
    // Empty Host header is allowed so in-process tests work — a real HTTP
    // client always sends one.
    const hostHdr = (c.req.header('Host') ?? '').toLowerCase()
    if (hostHdr) {
      const host = hostHdr.split(':')[0] ?? ''
      const isLoopbackHost = host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1'
      if (!isLoopbackHost) {
        return Promise.resolve(c.json({ error: 'Forbidden — non-loopback Host header' }, 403))
      }
    }

    if (!enforceAuth) return next()

    const token = process.env['FULCRUM_MONITOR_TOKEN']
    if (!token) {
      return Promise.resolve(c.json({ error: 'Unauthorized — FULCRUM_MONITOR_REQUIRE_AUTH=1 but FULCRUM_MONITOR_TOKEN is unset' }, 401))
    }
    const authHeader = c.req.header('Authorization') ?? ''
    const expected = `Bearer ${token}`
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
    const project = body.project_id ?? project_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)
    if (!project) return c.json({ error: 'project_id required' }, 400)
    if (!body.title) return c.json({ error: 'title required' }, 400)

    try {
      const task = await createTask({
        title: body.title,
        workspace_id: ws,
        project_id: project,
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
      const ws = workspace_id
      if (!ws) return c.json({ error: 'workspace_id required' }, 400)
      const task = await updateTask({ ...body, task_id, workspace_id: ws })
      return c.json({ data: task })
    } catch (err) {
      process.stderr.write(`[fulcrum/monitor] ${(err as Error).message}\n`); return c.json({ error: "internal_error" }, 500)
    }
  })

  // ─── POST /runs — start a policy-checked agent run ──────────────────────

  app.post('/runs', requireAuth, async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>) as {
      task_id?: string
      workspace_id?: string
      project_id?: string
      agent_role?: AgentRole
      agent_id?: string
      pi_profile?: string
      context_type?: 'primary' | 'subagent' | 'cron' | 'heartbeat' | 'flush'
      parent_run_id?: string
    }
    const ws = body.workspace_id ?? workspace_id
    const project = body.project_id ?? project_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)
    if (!project) return c.json({ error: 'project_id required' }, 400)
    if (!body.agent_role) return c.json({ error: 'agent_role required' }, 400)

    try {
      let task_id = body.task_id
      if (task_id) {
        const existing = getDb().prepare('SELECT task_id FROM tasks WHERE task_id = ? AND workspace_id = ?').get(task_id, ws)
        if (!existing) return c.json({ error: 'task not found' }, 404)
      } else {
        const task = await createTask({
          title: `[auto] ${body.agent_role} run`,
          workspace_id: ws,
          project_id: project,
        })
        task_id = task.task_id
      }

      const policy = loadConfig().policy
      const decision = await checkPolicy({ workspace_id: ws, task_id, role: body.agent_role, policy })
      if (!decision.allowed) {
        return c.json({
          error: 'policy_denied',
          reason: decision.reason,
          blocking_tasks: decision.blocking_tasks ?? [],
          current_wip: decision.current_wip ?? null,
          limit: decision.limit ?? null,
        }, 409)
      }

      const run = await startAgentRun({
        task_id,
        workspace_id: ws,
        role: body.agent_role,
        agent_id: body.agent_id,
        pi_profile: body.pi_profile,
        context_type: body.context_type ?? 'primary',
        parent_run_id: body.parent_run_id,
      })
      return c.json({ data: run }, 201)
    } catch (err) {
      const status = statusForError(err)
      process.stderr.write(`[fulcrum/monitor] ${errorMessage(err)}\n`)
      return c.json({ error: errorMessage(err) }, status)
    }
  })

  // ─── POST /runs/:id/heartbeat — update live run progress ────────────────

  app.post('/runs/:id/heartbeat', requireAuth, async (c) => {
    const run_id = c.req.param('id')
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>) as {
      current_step?: string
      progress_pct?: number
      current_path?: string
    }

    try {
      await heartbeatAgentRun({
        run_id,
        current_step: body.current_step ?? '',
        progress_pct: body.progress_pct ?? 0,
        current_path: body.current_path,
      })
      return c.json({ data: { run_id, ok: true } })
    } catch (err) {
      const status = statusForError(err)
      process.stderr.write(`[fulcrum/monitor] ${errorMessage(err)}\n`)
      return c.json({ error: errorMessage(err) }, status)
    }
  })

  // ─── POST /runs/:id/complete — finish a run ─────────────────────────────

  app.post('/runs/:id/complete', requireAuth, async (c) => {
    const run_id = c.req.param('id')
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>) as {
      output_summary?: string
      summary?: string
      artifact_paths?: string[] | string
    }

    try {
      const paths = parseStringList(body.artifact_paths)
      const run = await completeAgentRun({
        run_id,
        output_summary: body.output_summary ?? body.summary ?? '',
        artifacts: paths.length > 0 ? { files_changed: paths } : undefined,
      })
      return c.json({ data: run })
    } catch (err) {
      const status = statusForError(err)
      process.stderr.write(`[fulcrum/monitor] ${errorMessage(err)}\n`)
      return c.json({ error: errorMessage(err) }, status)
    }
  })

  // ─── POST /runs/:id/block — block a run with a reason ───────────────────

  app.post('/runs/:id/block', requireAuth, async (c) => {
    const run_id = c.req.param('id')
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>) as {
      reason?: string
      escalation_reason?: string
    }
    if (!body.reason) return c.json({ error: 'reason required' }, 400)

    try {
      const run = await blockAgentRun({
        run_id,
        reason: body.reason,
        escalation_reason: body.escalation_reason,
      })
      return c.json({ data: { ...run, reason: run.blocker } })
    } catch (err) {
      const status = statusForError(err)
      process.stderr.write(`[fulcrum/monitor] ${errorMessage(err)}\n`)
      return c.json({ error: errorMessage(err) }, status)
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
      const unblocked = await unblockAgentRun({ run_id, summary: body.summary })
      return c.json({ data: { run_id, status: unblocked.status, summary: body.summary ?? 'Unblocked by operator' } })
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
      await abortAgentRun({ run_id, reason: body.reason ?? 'Killed by operator' })
      return c.json({ data: { run_id, status: 'aborted' } })
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

  // ─── POST /memory/recall — plugin-friendly project memory recall ────────

  app.post('/memory/recall', requireAuth, async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>) as {
      query?: string
      workspace_id?: string
      project_id?: string | null
      limit?: number
      offset?: number
      scope?: MemoryScope
      kind?: MemoryKind
      query_scope?: 'session' | 'project' | 'workspace' | 'global'
      session_id?: string
      max_chars?: number
    }
    const ws = body.workspace_id ?? workspace_id
    const project = body.project_id ?? project_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)
    if (!body.query) return c.json({ error: 'query required' }, 400)

    try {
      const maxChars = body.max_chars ?? 1000
      const results = await recallMemory({
        workspace_id: ws,
        project_id: project,
        query: body.query,
        limit: body.limit ?? 10,
        offset: body.offset ?? 0,
        scope: body.scope,
        kind: body.kind,
        query_scope: body.query_scope,
        session_id: body.session_id,
        mode: 'total_ranked',
      })
      if ('reason' in results) return c.json({ memories: [], reason: results.reason })
      const memories = results.map(memory => ({
        memory_id: memory.memory_id,
        title: memory.title,
        summary: memory.summary,
        content: (('content' in memory ? memory.content : memory.summary) ?? '').slice(0, maxChars),
        kind: memory.kind,
        scope: memory.scope,
        file_path: memory.file_path,
        score: memory.recall_score ?? 0,
      }))
      return c.json({ memories })
    } catch (err) {
      const status = statusForError(err)
      process.stderr.write(`[fulcrum/monitor] ${errorMessage(err)}\n`)
      return c.json({ error: errorMessage(err) }, status)
    }
  })

  // ─── POST /memory/write — plugin-friendly memory write ──────────────────

  app.post('/memory/write', requireAuth, async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>) as {
      workspace_id?: string
      project_id?: string | null
      content?: string
      title?: string
      summary?: string
      kind?: MemoryKind
      scope?: MemoryScope
      tags?: string[] | string
    }
    const ws = body.workspace_id ?? workspace_id
    const project = body.project_id ?? project_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)
    if (!project) return c.json({ error: 'project_id required' }, 400)
    if (!body.content) return c.json({ error: 'content required' }, 400)

    try {
      const content = body.content
      const title = body.title ?? content.slice(0, 80)
      const summary = body.summary ?? title
      const tags = parseStringList(body.tags).slice(0, 32)
      const memory = await writeMemory({
        workspace_id: ws,
        project_id: project,
        content,
        title,
        summary,
        kind: body.kind ?? 'fact',
        scope: body.scope ?? 'project',
        tags,
      })
      return c.json({ saved: true, memory_id: memory.memory_id, project_id: project, tags }, 201)
    } catch (err) {
      const status = statusForError(err)
      process.stderr.write(`[fulcrum/monitor] ${errorMessage(err)}\n`)
      return c.json({ error: errorMessage(err) }, status)
    }
  })

  // ─── POST /cos-context — build CoS world-state markdown ─────────────────

  app.post('/cos-context', requireAuth, async (c) => {
    const body = await c.req.json().catch(() => ({}) as Record<string, unknown>) as {
      workspace_id?: string
      project_id?: string
      max_tokens?: number
    }
    const ws = body.workspace_id ?? workspace_id
    const project = body.project_id ?? project_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)
    if (!project) return c.json({ error: 'project_id required' }, 400)

    try {
      const context = await buildCosContext({
        workspace_id: ws,
        project_id: project,
        max_tokens: body.max_tokens,
      })
      return c.json({ context_markdown: context, project_id: project, workspace_id: ws })
    } catch (err) {
      const status = statusForError(err)
      process.stderr.write(`[fulcrum/monitor] ${errorMessage(err)}\n`)
      return c.json({ error: errorMessage(err) }, status)
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
