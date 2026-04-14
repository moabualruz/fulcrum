// packages/monitor/src/server.ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { getDb } from '@fulcrum/core'
import {
  getMetrics,
  getBurndown,
  getPerRoleMetrics,
  getMemoryMetrics,
  getForecasting,
} from './metrics.js'
import type { MonitorServer, MonitorServerConfig } from './types.js'

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

    return c.json({
      data: {
        task_count: taskCount,
        run_count: runCount,
        memory_count: memoryCount,
        event_count: eventCount,
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

  app.get('/replay/:run_id', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const run_id = c.req.param('run_id')

    const db = getDb()
    const events = db.prepare(`
      SELECT event_id, event_type, payload, ts
      FROM events
      WHERE workspace_id = ? AND JSON_EXTRACT(payload, '$.run_id') = ?
      ORDER BY ts ASC
    `).all(ws, run_id) as Array<{ event_id: string; event_type: string; payload: string; ts: string }>

    if (events.length === 0) {
      return c.json({ error: 'run not found' }, 404)
    }

    return c.json({
      data: events.map((e) => ({
        ...e,
        payload: JSON.parse(e.payload) as unknown,
      })),
    })
  })

  app.get('/analytics/forecast', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)

    const horizon_days = parseInt(c.req.query('horizon_days') ?? '30', 10)
    const db = getDb()
    const data = getForecasting(db, { workspace_id: ws, horizon_days })
    return c.json({ data })
  })

  let serverInstance: ReturnType<typeof serve> | null = null

  return {
    port,
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
