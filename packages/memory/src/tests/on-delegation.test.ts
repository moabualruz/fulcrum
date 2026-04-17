import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb, closeDb, _configureDb, runMigrations } from '@moabualruz/fulcrum-core'
import { onDelegation } from '../hooks/on-delegation.js'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

describe('onDelegation — v2a PR 8 Task 41', () => {
  let db: Database.Database

  beforeEach(() => {
    db = freshDb()
    db.prepare(`INSERT INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1','ws_1','p','git','active','worktree','2026-04-17T00:00:00Z')`).run()
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, display_id, title, status, status_category, priority, created_at, updated_at) VALUES ('task_p','ws_1','proj_1','T-1','parent task','running','active','medium','2026-04-17T00:00:00Z','2026-04-17T00:00:00Z')`).run()
    // Parent run — primary
    db.prepare(`INSERT INTO agent_runs (run_id, task_id, workspace_id, project_id, display_id, agent_id, role, status, status_category, context_type, started_at, updated_at) VALUES ('run_parent','task_p','ws_1','proj_1','R-1','a','software_engineer','running','active','primary','2026-04-17T00:00:00Z','2026-04-17T00:00:00Z')`).run()
    // Child run — subagent
    db.prepare(`INSERT INTO agent_runs (run_id, task_id, workspace_id, project_id, display_id, agent_id, role, status, status_category, context_type, parent_run_id, started_at, updated_at) VALUES ('run_child','task_p','ws_1','proj_1','R-2','b','code_reviewer','finished','done','subagent','run_parent','2026-04-17T00:00:00Z','2026-04-17T00:00:00Z')`).run()
  })
  afterEach(() => closeDb())

  it('writes a delegation_summary attributed to the parent', async () => {
    const r = await onDelegation({
      child_run_id: 'run_child',
      parent_run_id: 'run_parent',
      task: 'review the auth refactor',
      result: 'approved with one inline comment on token rotation',
      artifacts: ['review-auth-refactor.md'],
    }, db)
    expect(r).toBeDefined()
    expect(r!.parent_workspace_id).toBe('ws_1')
    const row = db.prepare(`SELECT kind, content, provenance FROM memories WHERE memory_id = ?`).get(r!.memory_id) as { kind: string; content: string; provenance: string }
    expect(row.kind).toBe('delegation_summary')
    expect(row.content).toContain('review the auth refactor')
    expect(row.content).toContain('approved with one inline comment')
    const prov = JSON.parse(row.provenance)
    expect(prov.hook_point).toBe('on_delegation')
    expect(prov.parent_run_id).toBe('run_parent')
    expect(prov.child_run_id).toBe('run_child')
    expect(prov.artifacts).toContain('review-auth-refactor.md')
  })

  it('walks the parent_run_id chain to find the topmost primary', async () => {
    // Insert a third generation: grandchild → child → parent.
    db.prepare(`INSERT INTO agent_runs (run_id, task_id, workspace_id, project_id, display_id, agent_id, role, status, status_category, context_type, parent_run_id, started_at, updated_at) VALUES ('run_grand','task_p','ws_1','proj_1','R-3','c','research_worker','finished','done','subagent','run_child','2026-04-17T00:00:00Z','2026-04-17T00:00:00Z')`).run()
    const r = await onDelegation({
      child_run_id: 'run_grand',
      parent_run_id: 'run_child', // direct parent is itself a subagent
      task: 'fetch upstream changelog',
      result: 'no breaking changes since v2.4',
    }, db)
    expect(r).toBeDefined()
    // Memory should still attribute to the topmost primary run's workspace/project.
    expect(r!.parent_workspace_id).toBe('ws_1')
  })

  it('returns null when the parent run does not exist', async () => {
    const r = await onDelegation({
      child_run_id: 'run_child',
      parent_run_id: 'run_missing',
      task: 't',
      result: 'r',
    }, db)
    expect(r).toBeNull()
  })

  it('truncates summary at the 800-char cap with the trailing marker', async () => {
    const r = await onDelegation({
      child_run_id: 'run_child',
      parent_run_id: 'run_parent',
      task: 'x'.repeat(400),
      result: 'y'.repeat(400),
    }, db)
    expect(r).toBeDefined()
    const row = db.prepare(`SELECT content FROM memories WHERE memory_id = ?`).get(r!.memory_id) as { content: string }
    expect(row.content.length).toBeLessThanOrEqual(800)
    expect(row.content).toMatch(/truncated/)
  })
})
