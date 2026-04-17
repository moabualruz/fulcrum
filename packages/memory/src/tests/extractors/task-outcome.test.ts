import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, closeDb, _configureDb, runMigrations } from 'fulcrum-agent-core'
import { synthesizeTaskOutcome, synthesizeBlockerResolution } from '../../extractors/task-outcome.js'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

describe('synthesizeTaskOutcome — v2a PR 8 Task 39', () => {
  let db: Database.Database

  beforeEach(() => {
    db = freshDb()
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1','ws_1','p','git','active','worktree','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, display_id, title, description, status, status_category, priority, created_at, updated_at) VALUES ('task_a','ws_1','proj_1','T-1','Wire the auth middleware','make /api/auth ok','completed','done','medium','2026-04-17T00:00:00Z','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO agent_runs (run_id, task_id, workspace_id, project_id, display_id, agent_id, role, status, status_category, output_summary, started_at, updated_at) VALUES ('run_1','task_a','ws_1','proj_1','R-1','a','software_engineer','finished','done','rewrote auth middleware to use the new token store','2026-04-17T00:00:00Z','2026-04-17T01:00:00Z')`).run()
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, project_id, scope, kind, title, content, task_id, file_path, slug, vault_path, created_at, updated_at, last_accessed_at)
                VALUES ('mem_p1','ws_1','proj_1','project','file_patch','patch','rewrote middleware','task_a','src/auth.ts','mem_p1','legacy/mem_p1.md','2026-04-17T00:30:00Z','2026-04-17T00:30:00Z','2026-04-17T00:30:00Z')`).run()
  })
  afterEach(() => closeDb())

  it('produces a task_outcome with files_touched derived from file_patch rows', async () => {
    const result = await synthesizeTaskOutcome('task_a', db)
    expect(result).toBeDefined()
    expect(result!.kind).toBe('task_outcome')
    expect(result!.files_touched).toContain('src/auth.ts')
    expect(result!.summary).toContain('Wire the auth middleware')
    expect(result!.summary).toContain('rewrote auth middleware')
  })

  it('writes a memories row with kind=task_outcome and provenance.run_id set', async () => {
    await synthesizeTaskOutcome('task_a', db)
    const row = db.prepare(`SELECT kind, provenance FROM memories WHERE task_id='task_a' AND kind='task_outcome'`).get() as { kind: string; provenance: string }
    expect(row).toBeDefined()
    expect(row.kind).toBe('task_outcome')
    const prov = JSON.parse(row.provenance)
    expect(prov.run_id).toBe('run_1')
    expect(prov.hook_point).toBe('update_task:completed')
  })

  it('is idempotent — second call returns null because the row already exists', async () => {
    const first = await synthesizeTaskOutcome('task_a', db)
    expect(first).toBeDefined()
    const second = await synthesizeTaskOutcome('task_a', db)
    expect(second).toBeNull()
  })

  it('returns null when the task is not found', async () => {
    const r = await synthesizeTaskOutcome('task_missing', db)
    expect(r).toBeNull()
  })
})

describe('synthesizeBlockerResolution — v2a PR 8 Task 40', () => {
  let db: Database.Database

  beforeEach(() => {
    db = freshDb()
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1','ws_1','p','git','active','worktree','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, display_id, title, description, status, status_category, priority, note, created_at, updated_at) VALUES ('task_b','ws_1','proj_1','T-2','Migrate to v3','blocked on upstream','blocked','blocked','high','need OWNER review on the auth contract','2026-04-17T00:00:00Z','2026-04-17T00:00:00Z')`).run()
  })
  afterEach(() => closeDb())

  it('produces a blocker_resolution with the task note carried into summary', async () => {
    const result = await synthesizeBlockerResolution('task_b', db)
    expect(result).toBeDefined()
    expect(result!.kind).toBe('blocker_resolution')
    expect(result!.summary).toContain('need OWNER review')
    expect(result!.summary).toContain('Migrate to v3')
  })

  it('writes provenance.hook_point=update_task:blocked', async () => {
    await synthesizeBlockerResolution('task_b', db)
    const row = db.prepare(`SELECT provenance FROM memories WHERE task_id='task_b' AND kind='blocker_resolution'`).get() as { provenance: string }
    expect(JSON.parse(row.provenance).hook_point).toBe('update_task:blocked')
  })

  it('race-guard: returns null if a task_outcome / blocker_resolution / session_summary already exists for the task', async () => {
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, project_id, scope, kind, title, content, task_id, slug, vault_path, created_at, updated_at, last_accessed_at)
                VALUES ('mem_existing','ws_1','proj_1','project','session_summary','existing','x','task_b','mem_existing','legacy/mem_existing.md','2026-04-17T00:00:00Z','2026-04-17T00:00:00Z','2026-04-17T00:00:00Z')`).run()
    const r = await synthesizeBlockerResolution('task_b', db)
    expect(r).toBeNull()
  })
})
