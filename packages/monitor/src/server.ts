// packages/monitor/src/server.ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { getDb } from '@fulcrum/core'
import { getMetrics, getBurndown, replayRun } from './metrics.js'
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

  app.get('/runs/:id/replay', async (c) => {
    const run_id = c.req.param('id')
    const result = await replayRun({ run_id })
    return c.json(result)
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
