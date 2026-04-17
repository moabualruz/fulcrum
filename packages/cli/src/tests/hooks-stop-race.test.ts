// v2a PR 6 Task 31 — race-safe session_summary: concurrent stop() calls
// must produce at most one memory row per run.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, setDb, closeDb } from 'fulcrum-agent-core'
import { runMigrations } from 'fulcrum-agent-core'
import { writeSessionSummary } from '../hooks-session.js'
import type { HookContext } from 'fulcrum-agent-core'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

function seedRun(db: Database.Database, runId: string) {
  db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws1','w','active','2026-04-17')`).run()
  db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('p1','ws1','p','git','active','worktree','2026-04-17')`).run()
  db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, display_id, title, status, status_category, priority, created_at, updated_at) VALUES ('t1','ws1','p1','T-1','t','queued','backlog','medium','2026-04-17','2026-04-17')`).run()
  db.prepare(`
    INSERT INTO agent_runs (run_id, task_id, workspace_id, project_id, display_id, agent_id, role, status, status_category, context_type, started_at, updated_at)
    VALUES (?, 't1', 'ws1', 'p1', 'R-1', '', 'software_engineer', 'running', 'active', 'primary', '2026-04-17', '2026-04-17')
  `).run(runId)
}

function makeCtx(runId: string): HookContext {
  return {
    runId,
    workspace_id: 'ws1',
    project_id: 'p1',
    sessionId: 'sess_1',
    cliName: 'claude',
    toolName: '',
    toolInput: {},
    hookPoint: 'Stop',
  } as unknown as HookContext
}

describe('hooks-stop-race — concurrent stop() calls', () => {
  let db: Database.Database

  beforeEach(() => {
    db = freshDb()
    seedRun(db, 'run_race_test')
  })

  afterEach(() => closeDb())

  it('two concurrent writeSessionSummary calls produce at most one session_summary row', async () => {
    const ctx = makeCtx('run_race_test')
    const input = { ctx, contextType: 'primary' as const, summary: 'session ended', db }

    const [r1, r2] = await Promise.all([
      writeSessionSummary(input),
      writeSessionSummary(input),
    ])

    // Check what was actually written
    const rows = db.prepare(
      `SELECT memory_id, provenance FROM memories WHERE kind = 'session_summary'`
    ).all() as { memory_id: string; provenance: string }[]

    // One must be written; the other must be skipped (race or error)
    const writtenCount = [r1, r2].filter(o => o === 'written').length
    expect(writtenCount).toBe(1)
    expect(rows.length).toBe(1)
  })

  it('returns skipped-race if task_outcome already exists for the run', async () => {
    // Seed a task_outcome directly via SQL to avoid writeMemory pipeline complexity.
    // The hasTaskOutcomeForRun guard uses json_extract(provenance, '$.run_id').
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, scope, kind, title, summary, content,
        tags, entities, confidence, importance, task_id, provenance, created_at, updated_at, last_accessed_at)
      VALUES ('mem_to_1','ws1','p1','task','task_outcome','done','done','done',
        '[]','[]',1.0,0.5,'t1',?,datetime('now'),datetime('now'),datetime('now'))
    `).run(JSON.stringify({ run_id: 'run_race_test', hook_point: 'Stop', context_type: 'primary' }))

    const ctx = makeCtx('run_race_test')
    const result = await writeSessionSummary({ ctx, contextType: 'primary', summary: 'summary', db })
    expect(result).toBe('skipped-race')
  })
})
