import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { closeDb, _configureDb, setDb, getDb } from '../db/client.js'
import { runMigrations } from '../db/migrations.js'
import { startAgentRun } from '../runs.js'

/**
 * v2a PR 1 Task 3 — agent_runs.context_type (NO DEFAULT at the API layer).
 *
 * Critical constraint #7: every start_agent_run call must explicitly supply
 * context_type. Calls without it surface ContextTypeRequiredError. The DB
 * column carries a backward-compat DEFAULT so the 29 existing direct-INSERT
 * sites (mostly tests) keep working; the fail-closed enforcement lives at the
 * startAgentRun() API boundary, where it prevents agent code from silently
 * writing memories on a run mis-categorized as primary.
 */

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

describe('agent_runs.context_type schema (v2a PR 1 Task 3)', () => {
  afterEach(() => closeDb())

  it('agent_runs has context_type column with CHECK over the v2a enum', () => {
    const db = freshDb()
    const cols = db.prepare('PRAGMA table_info(agent_runs)').all() as { name: string; notnull: number }[]
    const ctx = cols.find(c => c.name === 'context_type')
    expect(ctx, 'agent_runs.context_type missing').toBeDefined()
    expect(ctx!.notnull).toBe(1)

    // CHECK over the v2a enum: primary | subagent | cron | heartbeat | flush.
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1','ws_1','p','git','active','worktree','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, display_id, title, status, status_category, priority, created_at, updated_at) VALUES ('task_1','ws_1','proj_1','T-1','t','queued','backlog','medium','2026-04-17T00:00:00Z','2026-04-17T00:00:00Z')`).run()

    for (const ct of ['primary', 'subagent', 'cron', 'heartbeat', 'flush']) {
      expect(() => db.prepare(`
        INSERT INTO agent_runs (run_id, task_id, workspace_id, project_id, display_id, agent_id, role, status, status_category, context_type, started_at, updated_at)
        VALUES (?, 'task_1', 'ws_1', 'proj_1', ?, '', 'software_engineer', 'running', 'active', ?, '2026-04-17T00:00:00Z', '2026-04-17T00:00:00Z')
      `).run(`run_${ct}`, `R-${ct}`, ct)).not.toThrow()
    }

    expect(() => db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, project_id, display_id, agent_id, role, status, status_category, context_type, started_at, updated_at)
      VALUES ('run_bogus', 'task_1', 'ws_1', 'proj_1', 'R-bogus', '', 'software_engineer', 'running', 'active', 'made_up_ctx', '2026-04-17T00:00:00Z', '2026-04-17T00:00:00Z')
    `).run()).toThrow()
  })

  it('agent_runs has parent_run_id column (nullable)', () => {
    const db = freshDb()
    const cols = db.prepare('PRAGMA table_info(agent_runs)').all() as { name: string; notnull: number }[]
    const parent = cols.find(c => c.name === 'parent_run_id')
    expect(parent, 'agent_runs.parent_run_id missing').toBeDefined()
    expect(parent!.notnull).toBe(0)
  })
})

describe('startAgentRun + context_type — v2a PR 1 deferred-strict mode', () => {
  beforeEach(() => {
    const db = freshDb()
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1','ws_1','p','git','active','worktree','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, display_id, title, status, status_category, priority, created_at, updated_at) VALUES ('task_1','ws_1','proj_1','T-1','t','queued','backlog','medium','2026-04-17T00:00:00Z','2026-04-17T00:00:00Z')`).run()
  })
  afterEach(() => closeDb())

  it('rejects an unknown context_type value', async () => {
    await expect(startAgentRun({
      task_id: 'task_1',
      workspace_id: 'ws_1',
      role: 'software_engineer',
      context_type: 'made_up' as unknown as 'primary',
    })).rejects.toThrow(/unknown context_type/i)
  })

  it('warns + defaults to primary when context_type is omitted (PR 6 will throw)', async () => {
    const writes: string[] = []
    const original = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((chunk: string | Uint8Array): boolean => {
      writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'))
      return true
    }) as typeof process.stderr.write
    try {
      const run = await startAgentRun({
        task_id: 'task_1',
        workspace_id: 'ws_1',
        role: 'software_engineer',
      })
      expect(run.context_type).toBe('primary')
      expect(writes.join('')).toMatch(/startAgentRun called without context_type/)
    } finally {
      process.stderr.write = original
    }
  })

  it('persists context_type and parent_run_id when provided', async () => {
    const run = await startAgentRun({
      task_id: 'task_1',
      workspace_id: 'ws_1',
      role: 'software_engineer',
      context_type: 'subagent',
      parent_run_id: 'run_parent_xyz',
    })
    expect(run.context_type).toBe('subagent')
    expect(run.parent_run_id).toBe('run_parent_xyz')
  })
})
