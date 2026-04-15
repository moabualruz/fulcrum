// packages/monitor/src/server.ts
import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { randomBytes, timingSafeEqual } from 'crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import {
  getDb,
  listTasks, createTask, updateTask,
  startAgentRun, heartbeatAgentRun, completeAgentRun, blockAgentRun,
  getAgentRunStatus,
  buildCosContext,
  loadConfig,
  createWorkspace, createProject, getProject,
  isL1, type AgentRole,
  globalDataDir,
} from '@fulcrum/core'
import { writeMemory, recallMemory } from '@fulcrum/memory'
import { evaluatePolicy, logPolicyEvent, type EvaluatePolicyInput } from '@fulcrum/policy'
import {
  getMetrics,
  getBurndown,
  getPerRoleMetrics,
  getMemoryMetrics,
  getForecasting,
} from './metrics.js'
import type { MonitorServer, MonitorServerConfig } from './types.js'
import { buildAgentCard } from './agent-card.js'

// ---------- Auth helpers ----------

function getOrCreateMonitorToken(): string {
  const dir = globalDataDir()
  const tokenPath = join(dir, 'token')
  mkdirSync(dir, { recursive: true })
  if (existsSync(tokenPath)) {
    return readFileSync(tokenPath, 'utf-8').trim()
  }
  const token = randomBytes(32).toString('hex')
  writeFileSync(tokenPath, token, { mode: 0o600 })
  return token
}

function requireAuth(token: string): MiddlewareHandler {
  const tokenBuf = Buffer.from(token)
  return async (c, next) => {
    const auth = c.req.header('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) {
      return c.json({ error: 'unauthorized' }, 401)
    }
    const provided = Buffer.from(auth.slice(7))
    if (provided.length !== tokenBuf.length || !timingSafeEqual(provided, tokenBuf)) {
      return c.json({ error: 'unauthorized' }, 401)
    }
    await next()
  }
}

// ---------- Pagination helper ----------

interface PaginatedResult<T> {
  data: T[]
  pagination: {
    total: number
    limit: number
    offset: number
    next_cursor: string | null
  }
}

/**
 * Wrap a list query result with standard pagination metadata.
 * `next_cursor` is the next offset as a string, or null when on the last page.
 */
function paginate<T>(
  data: T[],
  total: number,
  limit: number,
  offset: number,
): PaginatedResult<T> {
  const nextOffset = offset + data.length
  const next_cursor = nextOffset < total ? String(nextOffset) : null
  return { data, pagination: { total, limit, offset, next_cursor } }
}

export function startMonitorServer(config: MonitorServerConfig): MonitorServer {
  const app = new Hono()
  // Use config port (default 4721) unless explicitly overridden
  const fulcrumConfig = loadConfig()
  const port = config.port ?? fulcrumConfig.port ?? 4721
  const host = config.host ?? '127.0.0.1'
  const workspace_id = config.workspace_id ?? fulcrumConfig.workspace_id ?? undefined

  // CORS — restrict to localhost only
  app.use('*', cors({
    origin: ['http://localhost:4721', 'http://127.0.0.1:4721'],
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }))

  // Load or create the bearer token for mutating endpoints
  const monitorToken = getOrCreateMonitorToken()
  const auth = requireAuth(monitorToken)

  // A2A Agent Card — public discovery endpoint, no auth required
  app.get('/.well-known/agent.json', (c) => {
    const baseUrl = `http://${host}:${port}`
    const card = buildAgentCard({ baseUrl, workspace_id })
    return c.json(card)
  })

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
        let lastRowid = parseInt(c.req.header('Last-Event-ID') ?? '0', 10) || 0

        const poll = () => {
          try {
            const db = getDb()
            let query = `SELECT *, rowid FROM events WHERE workspace_id = ? AND rowid > ? ORDER BY rowid ASC LIMIT 100`
            const params: unknown[] = [ws ?? '', lastRowid]

            if (!ws) {
              query = `SELECT *, rowid FROM events WHERE rowid > ? ORDER BY rowid ASC LIMIT 100`
              params.splice(0, 1) // remove ws placeholder, keep only lastRowid
            }

            const rows = db.prepare(query).all(...params) as Array<{
              evt_id: string
              evt_type: string
              payload: string
              ts: string
              rowid: number
            }>

            for (const row of rows) {
              const data = JSON.stringify({
                event_id: row.evt_id,
                event_type: row.evt_type,
                payload: JSON.parse(row.payload) as unknown,
                ts: row.ts,
              })
              controller.enqueue(new TextEncoder().encode(`id: ${row.rowid}\ndata: ${data}\n\n`))
              lastRowid = row.rowid
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
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200)
    const offset = parseInt(c.req.query('offset') ?? c.req.query('cursor') ?? '0', 10)

    const total = (db.prepare('SELECT COUNT(*) AS n FROM agent_runs WHERE workspace_id = ?').get(ws) as { n: number }).n
    const rows = db.prepare(
      'SELECT * FROM agent_runs WHERE workspace_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?'
    ).all(ws, limit, offset)
    return c.json(paginate(rows, total, limit, offset))
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
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200)
    const offset = parseInt(c.req.query('offset') ?? c.req.query('cursor') ?? '0', 10)

    const total = (db.prepare('SELECT COUNT(*) AS n FROM artifacts WHERE workspace_id = ?').get(ws) as { n: number }).n
    const rows = db.prepare(
      'SELECT * FROM artifacts WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(ws, limit, offset)
    return c.json(paginate(rows, total, limit, offset))
  })

  app.get('/memory-trace', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)
    const db = getDb()
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200)
    const offset = parseInt(c.req.query('offset') ?? c.req.query('cursor') ?? '0', 10)

    const total = (db.prepare('SELECT COUNT(*) AS n FROM memories WHERE workspace_id = ?').get(ws) as { n: number }).n
    const rows = db.prepare(
      'SELECT * FROM memories WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(ws, limit, offset)
    return c.json(paginate(rows, total, limit, offset))
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
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200)
    const offset = parseInt(c.req.query('offset') ?? c.req.query('cursor') ?? '0', 10)

    const total = (db.prepare('SELECT COUNT(*) AS n FROM team_instances WHERE workspace_id = ?').get(ws) as { n: number }).n
    const rows = db.prepare(
      'SELECT * FROM team_instances WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(ws, limit, offset)
    return c.json(paginate(rows, total, limit, offset))
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
      SELECT evt_id AS event_id, evt_type AS event_type, payload, ts
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

  // ─── Control / write endpoints ─────────────────────────────────────────────

  // Ensure workspace and project exist (auto-create for agent integrations).
  // Routed through core CRUD so FK/enum validation lives in one place.
  async function ensureWorkspace(ws: string, name?: string): Promise<void> {
    await createWorkspace({ workspace_id: ws, name: name ?? ws })
  }

  async function ensureProject(ws: string, proj: string, name?: string): Promise<void> {
    const existing = await getProject(proj)
    if (existing) return
    await createProject({ workspace_id: ws, project_id: proj, name: name ?? proj })
  }

  app.get('/tasks', (c) => {
    const ws = c.req.query('workspace_id') ?? workspace_id
    if (!ws) return c.json({ error: 'workspace_id required' }, 400)
    const db = getDb()
    const proj = c.req.query('project_id')
    const status = c.req.query('status')
    const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200)
    const offset = parseInt(c.req.query('offset') ?? c.req.query('cursor') ?? '0', 10)

    const whereParts = ['workspace_id = ?']
    const params: unknown[] = [ws]
    if (proj) { whereParts.push('project_id = ?'); params.push(proj) }
    if (status) { whereParts.push('status = ?'); params.push(status) }
    const where = whereParts.join(' AND ')

    const total = (db.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE ${where}`).get(...params) as { n: number }).n
    const rows = db.prepare(`SELECT * FROM tasks WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset)
    return c.json(paginate(rows, total, limit, offset))
  })

  app.get('/workspaces', (c) => {
    const db = getDb()
    const rows = db.prepare(
      'SELECT workspace_id, name, status, created_at FROM workspaces ORDER BY created_at DESC LIMIT 50'
    ).all()
    return c.json({ workspaces: rows })
  })

  app.get('/projects', (c) => {
    const ws = c.req.query('workspace_id')
    const db = getDb()
    const rows = ws
      ? db.prepare('SELECT * FROM projects WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100').all(ws)
      : db.prepare('SELECT * FROM projects ORDER BY created_at DESC LIMIT 100').all()
    return c.json({ projects: rows })
  })

  app.post('/tasks', auth, async (c) => {
    try {
      const body = await c.req.json() as {
        title: string; project_id: string; workspace_id: string
        description?: string; priority?: string; assigned_to?: string; done_criteria?: string
      }
      if (!body.title || !body.project_id || !body.workspace_id) {
        return c.json({ error: 'title, project_id, workspace_id are required' }, 400)
      }
      await ensureWorkspace(body.workspace_id)
      await ensureProject(body.workspace_id, body.project_id)
      const task = await createTask({
        title: body.title,
        project_id: body.project_id,
        workspace_id: body.workspace_id,
        description: body.description,
        priority: body.priority as 'critical' | 'high' | 'medium' | 'low' | 'none' | undefined,
        assigned_to: body.assigned_to,
        done_criteria: body.done_criteria,
      })
      return c.json(task)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  app.patch('/tasks/:id', auth, async (c) => {
    try {
      const task_id = c.req.param('id')
      const body = await c.req.json() as { status?: string; note?: string; assigned_to?: string }
      const task = await updateTask({
        task_id,
        status: body.status as Parameters<typeof updateTask>[0]['status'],
        note: body.note,
        assigned_to: body.assigned_to,
      })
      return c.json(task)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  app.post('/runs', auth, async (c) => {
    try {
      const body = await c.req.json() as {
        task_id?: string; agent_role: string; workspace_id: string
        project_id?: string; worktree_path?: string; pi_run_id?: string
      }
      if (!body.agent_role || !body.workspace_id) {
        return c.json({ error: 'agent_role and workspace_id are required' }, 400)
      }
      const db = getDb()
      const proj = body.project_id || body.workspace_id
      await ensureWorkspace(body.workspace_id)
      await ensureProject(body.workspace_id, proj)

      // Auto-create a stub task if task_id is missing or not found
      let task_id = body.task_id
      if (!task_id) {
        const stub = await createTask({
          title: `[auto] ${body.agent_role} run`,
          workspace_id: body.workspace_id,
          project_id: proj,
          description: 'Auto-created stub task for agent run registration',
        })
        task_id = stub.task_id
      } else {
        const existing = db.prepare('SELECT task_id FROM tasks WHERE task_id = ?').get(task_id)
        if (!existing) {
          const stub = await createTask({
            title: `[auto] ${body.agent_role} run`,
            workspace_id: body.workspace_id,
            project_id: proj,
            description: `Auto-created stub task for run with task_id=${task_id}`,
          })
          task_id = stub.task_id
        }
      }

      const run = await startAgentRun({
        task_id,
        role: body.agent_role as Parameters<typeof startAgentRun>[0]['role'],
        workspace_id: body.workspace_id,
        agent_id: `pi/${body.agent_role}`,
        pi_profile: body.agent_role,
      })
      return c.json({ run_id: run.run_id, status: run.status })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  app.post('/runs/:id/heartbeat', auth, async (c) => {
    try {
      const run_id = c.req.param('id')
      const body = await c.req.json() as { workspace_id?: string; current_step?: string; progress_pct?: number }
      await heartbeatAgentRun({
        run_id,
        current_step: body.current_step ?? '',
        progress_pct: body.progress_pct ?? 0,
      })
      return c.json({ run_id, ok: true })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  app.post('/runs/:id/complete', auth, async (c) => {
    try {
      const run_id = c.req.param('id')
      const body = await c.req.json() as { workspace_id?: string; output_summary?: string; artifact_paths?: string }
      const paths = (body.artifact_paths ?? '').split(',').map(p => p.trim()).filter(Boolean)
      const run = await completeAgentRun({
        run_id,
        output_summary: body.output_summary ?? '',
        artifacts: paths.length > 0 ? { files_changed: paths } : undefined,
      })
      return c.json({ run_id: run.run_id, status: run.status })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  app.post('/runs/:id/block', auth, async (c) => {
    try {
      const run_id = c.req.param('id')
      const body = await c.req.json() as { workspace_id?: string; reason: string }
      if (!body.reason?.trim()) return c.json({ error: 'reason is required' }, 400)
      const run = await blockAgentRun({ run_id, reason: body.reason })
      return c.json({ run_id: run.run_id, status: run.status, reason: run.blocker })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  app.post('/memory/recall', auth, async (c) => {
    try {
      const body = await c.req.json() as { query: string; workspace_id: string; project_id?: string; task_id?: string; limit?: number }
      if (!body.query || !body.workspace_id) return c.json({ error: 'query and workspace_id are required' }, 400)
      const memories = await recallMemory({
        query: body.query,
        workspace_id: body.workspace_id,
        project_id: body.project_id,
        task_id: body.task_id,
        limit: body.limit ?? 10,
        mode: 'full',
      } as unknown as Parameters<typeof recallMemory>[0])
      return c.json({
        memories: (memories as Array<{ content?: string; tags?: string[]; memory_id: string; kind?: string }>).map(m => ({
          content: (m.content ?? '').slice(0, 500),
          score: 0.0,
          tags: m.tags ?? [],
          memory_id: m.memory_id,
          kind: m.kind,
        }))
      })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  app.post('/memory/write', auth, async (c) => {
    try {
      const body = await c.req.json() as {
        content: string; workspace_id: string; project_id: string
        title?: string; tags?: string; scope?: string; kind?: string
      }
      if (!body.content || !body.workspace_id || !body.project_id) {
        return c.json({ error: 'content, workspace_id, project_id are required' }, 400)
      }
      await ensureWorkspace(body.workspace_id)
      await ensureProject(body.workspace_id, body.project_id)
      const tagList = body.tags ? body.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : []
      const title = body.title ?? body.content.slice(0, 80)
      const memory = await writeMemory({
        content: body.content,
        workspace_id: body.workspace_id,
        project_id: body.project_id,
        title,
        summary: title,
        scope: (body.scope ?? 'project') as Parameters<typeof writeMemory>[0]['scope'],
        kind: (body.kind ?? 'fact') as Parameters<typeof writeMemory>[0]['kind'],
        tags: tagList,
      } as Parameters<typeof writeMemory>[0])
      return c.json({ saved: true, memory_id: memory.memory_id, project_id: body.project_id, tags: tagList })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  app.post('/cos-context', auth, async (c) => {
    try {
      const body = await c.req.json() as {
        goal?: string; project_id: string; workspace_id: string
        max_tasks?: number; max_events?: number
      }
      if (!body.project_id || !body.workspace_id) {
        return c.json({ error: 'project_id and workspace_id are required' }, 400)
      }
      const contextMarkdown = await buildCosContext({
        workspace_id: body.workspace_id,
        project_id: body.project_id,
      })
      return c.json({ context_markdown: contextMarkdown, project_id: body.project_id, workspace_id: body.workspace_id })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }
  })

  app.post('/policy/check', auth, async (c) => {
    let body: EvaluatePolicyInput & { run_id?: string }
    try {
      body = await c.req.json() as EvaluatePolicyInput & { run_id?: string }
    } catch (err) {
      return c.json({ error: (err as Error).message }, 500)
    }

    try {
      // Identity resolution: if run_id is provided, look up authoritative role from DB.
      // This prevents callers from spoofing their role via actor_id/actor_role.
      let actor_id = body.actor_id
      let actor_role = body.actor_role
      if (body.run_id) {
        try {
          const run = await getAgentRunStatus({ run_id: body.run_id })
          actor_id = run.agent_id || body.actor_id
          actor_role = run.role
        } catch {
          // run not found — use caller-supplied identity as-is
        }
      }

      // If actor_role is not provided, derive it from actor_id (legacy format: "pi/<role>")
      if (!actor_role) {
        actor_role = (body.actor_id?.split('/')[1] ?? body.actor_id ?? '') as AgentRole
      }

      const input: EvaluatePolicyInput = {
        ...body,
        actor_id,
        actor_role,
      }

      const decision = await evaluatePolicy(input)

      // Log the policy event asynchronously — audit log failures must not affect the decision
      logPolicyEvent({
        workspace_id: body.workspace_id ?? '',
        action: body.action,
        matched: !decision.allowed,
        actor_id: actor_id ?? '',
        rule_id: decision.rule_id ?? undefined,
        resource_type: body.resource_type,
        resource_id: body.resource_id,
        payload: body as unknown as Record<string, unknown>,
      }).catch((logErr: unknown) => {
        process.stderr.write(`[policy/check] logPolicyEvent failed: ${(logErr as Error).message}\n`)
      })

      return c.json({ allowed: decision.allowed, reason: decision.reason ?? '' })
    } catch (err) {
      // Policy engine error — fall back to the simple invariant check so callers
      // still get the invoke_team guard even when the DB is unavailable.
      process.stderr.write(`[policy/check] evaluatePolicy error, falling back to stub: ${(err as Error).message}\n`)
      const role = body.actor_id?.split('/')[1] ?? body.actor_id ?? ''
      const isTeamInvoke = body.action.includes('invoke_team') || body.action.includes('team_invoke')
      const callerIsL1 = isL1(role as AgentRole)
      if (isTeamInvoke && !callerIsL1) {
        return c.json({ allowed: false, reason: 'Only chief_of_staff may invoke teams' })
      }
      return c.json({ allowed: true, reason: '' })
    }
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
