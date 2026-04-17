// packages/monitor/src/tests/write-endpoints.test.ts
// Tests for mutation HTTP endpoints: POST /tasks, PATCH /tasks/:id,
// POST /runs/:id/unblock, POST /runs/:id/kill, POST /reviews/:id/approve,
// POST /reviews/:id/reject — plus bearer token auth middleware.

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
  server = startMonitorServer({ workspace_id: 'ws_1', bypass_auth: true })
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

    const row = db.prepare('SELECT status FROM agent_runs WHERE run_id = ?').get(run.run_id) as { status: string }
    expect(row.status).toBe('running')
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
  it('kills a running agent run', async () => {
    const task = await createTask({ title: 'Task to kill', workspace_id: 'ws_1', project_id: 'proj_1' })
    const run = await startAgentRun({ context_type: 'primary', task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })

    const res = await post(`/runs/${run.run_id}/kill`, { reason: 'operator request' })
    expect(res.status).toBe(200)
    const json = await res.json() as { data: { run_id: string; status: string } }
    expect(json.data.status).toBe('blocked')
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
    authServer = startMonitorServer({ workspace_id: 'ws_auth' })
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
})
