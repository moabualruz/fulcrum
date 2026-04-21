// packages/monitor/src/tests/write-endpoints.test.ts
// Tests for mutation HTTP endpoints: task writes, run lifecycle writes,
// review writes, memory writes/recall, CoS context, and bearer token auth.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setDb, _configureDb, runMigrations, createTask, startAgentRun } from 'fulcrum-agent-core'
import { startMonitorServer } from '../server.js'
import Database from 'better-sqlite3'

// Valid project type per CHECK constraint in m020
const VALID_PROJECT_TYPE = 'git'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)

  // Seed workspace and project with schema-valid values
  db.prepare(`INSERT OR IGNORE INTO workspaces (workspace_id, name, status) VALUES ('ws_1', 'Test', 'active')`).run()
  db.prepare(`INSERT OR IGNORE INTO projects (project_id, workspace_id, name, status, type) VALUES ('proj_1', 'ws_1', 'Test', 'active', '${VALID_PROJECT_TYPE}')`).run()
  return db
}

let db: Database.Database
let server: ReturnType<typeof startMonitorServer>

beforeEach(() => {
  db = createTestDb()
  // HIGH-9: bypass_auth requires both config.bypass_auth AND env to take
  // effect — the env guard prevents accidental production runs.
  process.env['FULCRUM_MONITOR_ALLOW_BYPASS'] = '1'
  server = startMonitorServer({ workspace_id: 'ws_1', project_id: 'proj_1', bypass_auth: true })
})

afterEach(async () => {
  delete process.env['FULCRUM_MONITOR_ALLOW_BYPASS']
  await server.stop()
  db.close()
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function post(path: string, body: unknown): Promise<Response> {
  return server.fetch(new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })) as Promise<Response>
}

function patch(path: string, body: unknown): Promise<Response> {
  return server.fetch(new Request(`http://localhost${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })) as Promise<Response>
}

// ── POST /tasks ────────────────────────────────────────────────────────────────

describe('POST /tasks', () => {
  it('creates a task and returns 201 with task data', async () => {
    const res = await post('/tasks', {
      title: 'Write tests',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    })
    expect(res.status).toBe(201)
    const json = await res.json() as { data: { title: string; task_id: string } }
    expect(json.data.title).toBe('Write tests')
    expect(json.data.task_id).toBeTruthy()
  })

  it('returns 400 when title is missing', async () => {
    const res = await post('/tasks', { workspace_id: 'ws_1' })
    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/title/)
  })

  it('uses server-default workspace_id when not provided in body', async () => {
    const res = await post('/tasks', { title: 'Implicit workspace', project_id: 'proj_1' })
    expect(res.status).toBe(201)
    const json = await res.json() as { data: { workspace_id: string } }
    expect(json.data.workspace_id).toBe('ws_1')
  })

  it('uses server-default project_id when not provided in body', async () => {
    const res = await post('/tasks', { title: 'Implicit project', workspace_id: 'ws_1' })
    expect(res.status).toBe(201)
    const json = await res.json() as { data: { project_id: string } }
    expect(json.data.project_id).toBe('proj_1')
  })

  it('rejects create when no project_id is available', async () => {
    const noProjectServer = startMonitorServer({ workspace_id: 'ws_1', bypass_auth: true })
    try {
      const res = await noProjectServer.fetch(new Request('http://localhost/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'No project context' }),
      })) as Response
      expect(res.status).toBe(400)
      const json = await res.json() as { error: string }
      expect(json.error).toMatch(/project_id/)
    } finally {
      await noProjectServer.stop()
    }
  })
})

// ── POST /runs and lifecycle endpoints ──────────────────────────────────────

describe('POST /runs', () => {
  it('starts a run for an existing task', async () => {
    const task = await createTask({ title: 'Task to run', workspace_id: 'ws_1', project_id: 'proj_1' })

    const res = await post('/runs', {
      task_id: task.task_id,
      agent_role: 'software_engineer',
      context_type: 'primary',
    })

    expect(res.status).toBe(201)
    const json = await res.json() as { data: { run_id: string; status: string; task_id: string } }
    expect(json.data.status).toBe('running')
    expect(json.data.task_id).toBe(task.task_id)

    const row = db.prepare('SELECT status, task_id FROM agent_runs WHERE run_id = ?').get(json.data.run_id) as {
      status: string
      task_id: string
    }
    expect(row.status).toBe('running')
    expect(row.task_id).toBe(task.task_id)
  })

  it('creates an auto task when task_id is omitted', async () => {
    const res = await post('/runs', {
      agent_role: 'qa_engineer',
      context_type: 'primary',
    })

    expect(res.status).toBe(201)
    const json = await res.json() as { data: { task_id: string; run_id: string } }
    expect(json.data.task_id).toBeTruthy()

    const task = db.prepare('SELECT title FROM tasks WHERE task_id = ?').get(json.data.task_id) as { title: string }
    expect(task.title).toContain('[auto] qa_engineer run')
  })
})

describe('POST /runs/:id/heartbeat', () => {
  it('updates run heartbeat progress', async () => {
    const task = await createTask({ title: 'Heartbeat task', workspace_id: 'ws_1', project_id: 'proj_1' })
    const run = await startAgentRun({ context_type: 'primary', task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })

    const res = await post(`/runs/${run.run_id}/heartbeat`, {
      current_step: 'writing tests',
      progress_pct: 40,
      current_path: 'packages/monitor/src/server.ts',
    })

    expect(res.status).toBe(200)
    const json = await res.json() as { data: { run_id: string; ok: boolean } }
    expect(json.data.ok).toBe(true)

    const row = db.prepare('SELECT current_step, progress_pct, current_path FROM agent_runs WHERE run_id = ?').get(run.run_id) as {
      current_step: string
      progress_pct: number
      current_path: string
    }
    expect(row.current_step).toBe('writing tests')
    expect(row.progress_pct).toBe(40)
    expect(row.current_path).toBe('packages/monitor/src/server.ts')
  })
})

describe('POST /runs/:id/complete', () => {
  it('finishes a run with an output summary', async () => {
    const task = await createTask({ title: 'Complete task', workspace_id: 'ws_1', project_id: 'proj_1' })
    const run = await startAgentRun({ context_type: 'primary', task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })

    const res = await post(`/runs/${run.run_id}/complete`, {
      output_summary: 'monitor lifecycle route implemented',
      artifact_paths: ['packages/monitor/src/server.ts'],
    })

    expect(res.status).toBe(200)
    const json = await res.json() as { data: { status: string } }
    expect(json.data.status).toBe('finished')

    const row = db.prepare('SELECT status, output_summary FROM agent_runs WHERE run_id = ?').get(run.run_id) as {
      status: string
      output_summary: string
    }
    expect(row.status).toBe('finished')
    expect(row.output_summary).toBe('monitor lifecycle route implemented')
  })
})

describe('POST /runs/:id/block', () => {
  it('blocks a run with a reason', async () => {
    const task = await createTask({ title: 'Block task', workspace_id: 'ws_1', project_id: 'proj_1' })
    const run = await startAgentRun({ context_type: 'primary', task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })

    const res = await post(`/runs/${run.run_id}/block`, { reason: 'waiting on operator' })

    expect(res.status).toBe(200)
    const json = await res.json() as { data: { status: string; reason: string } }
    expect(json.data.status).toBe('blocked')
    expect(json.data.reason).toBe('waiting on operator')

    const row = db.prepare('SELECT status, blocker FROM agent_runs WHERE run_id = ?').get(run.run_id) as {
      status: string
      blocker: string
    }
    expect(row.status).toBe('blocked')
    expect(row.blocker).toBe('waiting on operator')
  })
})

// ── PATCH /tasks/:id ──────────────────────────────────────────────────────────

describe('PATCH /tasks/:id', () => {
  it('updates task status', async () => {
    // Create a task first using the DB helper to avoid test coupling
    const task = await createTask({ title: 'Task to update', workspace_id: 'ws_1', project_id: 'proj_1' })

    const res = await patch(`/tasks/${task.task_id}`, { status: 'running' })
    expect(res.status).toBe(200)
    const json = await res.json() as { data: { status: string } }
    expect(json.data.status).toBe('running')
  })

  it('returns 500 for non-existent task_id', async () => {
    const res = await patch('/tasks/nonexistent_task', { status: 'completed' })
    expect(res.status).toBe(500)
  })
})

// ── POST /runs/:id/unblock ────────────────────────────────────────────────────

describe('POST /runs/:id/unblock', () => {
  it('unblocks a blocked run', async () => {
    const task = await createTask({ title: 'Task to unblock', workspace_id: 'ws_1', project_id: 'proj_1' })
    const run = await startAgentRun({ context_type: 'primary', task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    // Block directly via SQL to avoid notification side-effects in tests
    db.prepare(`UPDATE agent_runs SET status = 'blocked' WHERE run_id = ?`).run(run.run_id)

    const res = await post(`/runs/${run.run_id}/unblock`, {})
    expect(res.status).toBe(200)
    const json = await res.json() as { data: { status: string } }
    expect(json.data.status).toBe('running')

    const row = db.prepare('SELECT status, status_category, blocker FROM agent_runs WHERE run_id = ?').get(run.run_id) as {
      status: string
      status_category: string
      blocker: string | null
    }
    expect(row.status).toBe('running')
    expect(row.status_category).toBe('active')
    expect(row.blocker).toBeNull()

    const lifecycle = db.prepare("SELECT event_type FROM run_events WHERE run_id = ? AND event_type = 'unblocked'").get(run.run_id)
    expect(lifecycle).toBeTruthy()

    const evt = db.prepare("SELECT evt_type FROM events WHERE object_id = ? AND evt_type = 'agent_run_unblocked'").get(run.run_id)
    expect(evt).toBeTruthy()

    const projection = db.prepare('SELECT status, blocker FROM agent_state_projection WHERE run_id = ?').get(run.run_id) as {
      status: string
      blocker: string | null
    }
    expect(projection.status).toBe('running')
    expect(projection.blocker).toBeNull()
  })

  it('returns 404 for unknown run', async () => {
    const res = await post('/runs/nonexistent/unblock', {})
    expect(res.status).toBe(404)
  })

  it('returns 409 when run is not blocked', async () => {
    const task = await createTask({ title: 'Active task', workspace_id: 'ws_1', project_id: 'proj_1' })
    const run = await startAgentRun({ context_type: 'primary', task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    const res = await post(`/runs/${run.run_id}/unblock`, {})
    expect(res.status).toBe(409)
  })
})

// ── POST /runs/:id/kill ────────────────────────────────────────────────────────

describe('POST /runs/:id/kill', () => {
  it('aborts a running agent run', async () => {
    const task = await createTask({ title: 'Task to kill', workspace_id: 'ws_1', project_id: 'proj_1' })
    const run = await startAgentRun({ context_type: 'primary', task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })

    const res = await post(`/runs/${run.run_id}/kill`, { reason: 'operator request' })
    expect(res.status).toBe(200)
    const json = await res.json() as { data: { run_id: string; status: string } }
    expect(json.data.status).toBe('aborted')

    const row = db.prepare('SELECT status, status_category FROM agent_runs WHERE run_id = ?').get(run.run_id) as { status: string; status_category: string }
    expect(row.status).toBe('aborted')
    expect(row.status_category).toBe('done')

    const evt = db.prepare("SELECT evt_type FROM events WHERE object_id = ? AND evt_type = 'agent_run_aborted'").get(run.run_id)
    expect(evt).toBeTruthy()
  })

  it('returns 404 for unknown run', async () => {
    const res = await post('/runs/nonexistent/kill', {})
    expect(res.status).toBe(404)
  })

  it('returns 409 when run is already finished', async () => {
    const task = await createTask({ title: 'Done task', workspace_id: 'ws_1', project_id: 'proj_1' })
    const run = await startAgentRun({ context_type: 'primary', task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    db.prepare(`UPDATE agent_runs SET status = 'finished' WHERE run_id = ?`).run(run.run_id)

    const res = await post(`/runs/${run.run_id}/kill`, {})
    expect(res.status).toBe(409)
  })
})

// ── POST /reviews/:id/approve and /reject ─────────────────────────────────────

describe('POST /reviews/:id/approve', () => {
  function seedReview(status: string, review_id: string): void {
    // reviews schema: review_id, workspace_id, project_id, display_id,
    //                 target_type, target_id, status, ...
    db.prepare(`
      INSERT OR REPLACE INTO reviews
        (review_id, workspace_id, project_id, display_id, target_type, target_id, status, created_at, updated_at)
      VALUES (?, 'ws_1', 'proj_1', 'R-001', 'task', 'task_1', ?, datetime('now'), datetime('now'))
    `).run(review_id, status)
  }

  it('approves a pending review', async () => {
    seedReview('pending', 'rev_approve')
    const res = await post('/reviews/rev_approve/approve', { comment: 'LGTM' })
    expect(res.status).toBe(200)
    const json = await res.json() as { data: { status: string } }
    expect(json.data.status).toBe('approved')
  })

  it('returns 404 for unknown review', async () => {
    const res = await post('/reviews/nonexistent/approve', {})
    expect(res.status).toBe(404)
  })

  it('returns 409 when review is already approved', async () => {
    seedReview('approved', 'rev_already_approved')
    const res = await post('/reviews/rev_already_approved/approve', {})
    expect(res.status).toBe(409)
  })
})

describe('POST /reviews/:id/reject', () => {
  function seedReview(status: string, review_id: string): void {
    db.prepare(`
      INSERT OR REPLACE INTO reviews
        (review_id, workspace_id, project_id, display_id, target_type, target_id, status, created_at, updated_at)
      VALUES (?, 'ws_1', 'proj_1', 'R-002', 'task', 'task_1', ?, datetime('now'), datetime('now'))
    `).run(review_id, status)
  }

  it('rejects a pending review', async () => {
    seedReview('pending', 'rev_to_reject')
    const res = await post('/reviews/rev_to_reject/reject', { comment: 'Needs rework' })
    expect(res.status).toBe(200)
    const json = await res.json() as { data: { status: string } }
    expect(json.data.status).toBe('rejected')
  })

  it('returns 409 when review is not pending', async () => {
    seedReview('rejected', 'rev_already_rejected')
    const res = await post('/reviews/rev_already_rejected/reject', {})
    expect(res.status).toBe(409)
  })
})

// ── Memory and CoS monitor endpoints ─────────────────────────────────────────

describe('POST /memory/write and /memory/recall', () => {
  it('writes then recalls project memory for plugin consumers', async () => {
    const write = await post('/memory/write', {
      title: 'Monitor memory route',
      content: 'Monitor memory route stores project facts for PI cockpit recall.',
      tags: 'monitor,pi',
    })
    expect(write.status).toBe(201)
    const writeJson = await write.json() as { memory_id: string; saved: boolean; tags: string[] }
    expect(writeJson.saved).toBe(true)
    expect(writeJson.memory_id).toBeTruthy()
    expect(writeJson.tags).toEqual(['monitor', 'pi'])

    const recall = await post('/memory/recall', {
      query: 'PI cockpit recall',
      limit: 5,
    })
    expect(recall.status).toBe(200)
    const recallJson = await recall.json() as { memories: Array<{ memory_id: string; content: string }> }
    expect(recallJson.memories.some(memory => memory.memory_id === writeJson.memory_id)).toBe(true)
    expect(recallJson.memories[0]?.content).toContain('PI cockpit recall')
  })
})

describe('POST /cos-context', () => {
  it('builds Chief of Staff context markdown from monitor defaults', async () => {
    await createTask({ title: 'Queued context task', workspace_id: 'ws_1', project_id: 'proj_1' })

    const res = await post('/cos-context', { max_tokens: 200 })

    expect(res.status).toBe(200)
    const json = await res.json() as { context_markdown: string; workspace_id: string; project_id: string }
    expect(json.workspace_id).toBe('ws_1')
    expect(json.project_id).toBe('proj_1')
    expect(json.context_markdown).toContain('Workspace Status')
  })
})

// ── Bearer token auth ─────────────────────────────────────────────────────────

describe('bearer token auth', () => {
  let authServer: ReturnType<typeof startMonitorServer>
  let authDb: Database.Database

  beforeEach(() => {
    authDb = new Database(':memory:')
    _configureDb(authDb)
    runMigrations(authDb)
    setDb(authDb)
    authDb.prepare(`INSERT OR IGNORE INTO workspaces (workspace_id, name, status) VALUES ('ws_auth', 'Auth Test', 'active')`).run()
    authDb.prepare(`INSERT OR IGNORE INTO projects (project_id, workspace_id, name, status, type) VALUES ('proj_auth', 'ws_auth', 'Auth', 'active', 'git')`).run()
    process.env['FULCRUM_MONITOR_TOKEN'] = 'test-secret-token'
    process.env['FULCRUM_MONITOR_REQUIRE_AUTH'] = '1'
    authServer = startMonitorServer({ workspace_id: 'ws_auth', project_id: 'proj_auth' })
  })

  afterEach(async () => {
    await authServer.stop()
    authDb.close()
    delete process.env['FULCRUM_MONITOR_TOKEN']
    delete process.env['FULCRUM_MONITOR_REQUIRE_AUTH']
  })

  it('rejects POST /tasks without token', async () => {
    const res = await authServer.fetch(new Request('http://localhost/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Unauthorized task' }),
    })) as Response
    expect(res.status).toBe(401)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/Unauthorized/)
  })

  it('rejects POST /memory/write without token', async () => {
    const res = await authServer.fetch(new Request('http://localhost/memory/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Unauthorized memory' }),
    })) as Response
    expect(res.status).toBe(401)
  })

  it('rejects POST /tasks with wrong token', async () => {
    const res = await authServer.fetch(new Request('http://localhost/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer wrong-token' },
      body: JSON.stringify({ title: 'Wrong token task' }),
    })) as Response
    expect(res.status).toBe(401)
  })

  it('accepts POST /tasks with correct bearer token', async () => {
    const res = await authServer.fetch(new Request('http://localhost/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-secret-token',
      },
      body: JSON.stringify({ title: 'Authorized task', workspace_id: 'ws_auth', project_id: 'proj_auth' }),
    })) as Response
    expect(res.status).toBe(201)
  })

  it('allows read endpoints without token', async () => {
    const res = await authServer.fetch(new Request('http://localhost/status')) as Response
    expect(res.status).toBe(200)
  })

  it('returns workspace and project display names for TUI headers', async () => {
    const res = await authServer.fetch(new Request('http://localhost/status')) as Response
    expect(res.status).toBe(200)
    const body = await res.json() as {
      workspace_id: string
      workspace_name: string
      project_id: string
      project_name: string
    }
    expect(body.workspace_id).toBe('ws_auth')
    expect(body.workspace_name).toBe('Auth Test')
    expect(body.project_id).toBe('proj_auth')
    expect(body.project_name).toBe('Auth')
  })
})
