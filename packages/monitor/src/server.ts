// packages/monitor/src/server.ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { getDb, listAgentDefinitions } from '@fulcrum/core'
import { evaluatePolicy } from '@fulcrum/policy'
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

export function startMonitorServer(config: MonitorServerConfig): MonitorServer {
  const app = new Hono()
  const port = config.port ?? 7331
  const host = config.host ?? '127.0.0.1'
  const workspace_id = config.workspace_id

  app.get('/status', (c) => {
    return c.json({
      status: 'ok',
      workspace_id: workspace_id ?? null,
      ts: new Date().toISOString(),
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

    const stream = new ReadableStream({
      start(controller) {
        let lastId = c.req.header('Last-Event-ID') ?? ''

        const poll = () => {
          try {
            const db = getDb()
            let query = `SELECT * FROM events WHERE workspace_id = ? AND event_id > ? ORDER BY event_id ASC LIMIT 100`
            const params: unknown[] = [ws ?? '', lastId]

            if (!ws) {
              query = `SELECT * FROM events WHERE event_id > ? ORDER BY event_id ASC LIMIT 100`
              params.splice(0, 1) // remove ws placeholder, keep only lastId
            }

            const rows = db.prepare(query).all(...params) as Array<{
              event_id: string
              event_type: string
              payload: string
              ts: string
            }>

            for (const row of rows) {
              const data = JSON.stringify({
                event_id: row.event_id,
                event_type: row.event_type,
                payload: JSON.parse(row.payload) as unknown,
                ts: row.ts,
              })
              controller.enqueue(new TextEncoder().encode(`id: ${row.event_id}\ndata: ${data}\n\n`))
              lastId = row.event_id
            }
          } catch {
            // DB not yet available — skip this tick
          }
        }

        const interval = setInterval(poll, 2000)
        poll() // immediate first tick

        // Close stream cleanup (if client disconnects)
        c.req.raw.signal.addEventListener('abort', () => {
          clearInterval(interval)
          controller.close()
        })
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

    const result = await replayRun({ run_id })

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
      actor_role: body.actor_role as import('@fulcrum/core').AgentRole,
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
      serverInstance = serve({ fetch: app.fetch, port, hostname: host })
    },
    stop: async () => {
      if (serverInstance) {
        serverInstance.close()
        serverInstance = null
      }
    },
  }
}
