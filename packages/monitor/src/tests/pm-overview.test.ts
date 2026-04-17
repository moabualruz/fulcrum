import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, runMigrations, setDb } from 'fulcrum-agent-core'
import { startMonitorServer } from '../server.js'

let db: Database.Database
let server: ReturnType<typeof startMonitorServer>

beforeEach(() => {
  db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)

  db.prepare(`INSERT INTO workspaces (workspace_id, name, status) VALUES ('ws_pm', 'PM', 'active')`).run()
  db.prepare(`INSERT INTO projects (project_id, workspace_id, name, status, type) VALUES ('proj_pm', 'ws_pm', 'PM', 'active', 'git')`).run()

  db.prepare(`
    INSERT INTO epics (epic_id, workspace_id, project_id, display_id, title, status, status_category, priority)
    VALUES ('epic_1', 'ws_pm', 'proj_pm', 'E-1', 'Launch cockpit', 'in_progress', 'active', 'high')
  `).run()
  db.prepare(`
    INSERT INTO issues (issue_id, workspace_id, project_id, epic_id, display_id, title, status, status_category, priority)
    VALUES
      ('issue_1', 'ws_pm', 'proj_pm', 'epic_1', 'I-1', 'Blocked task', 'blocked', 'blocked', 'high'),
      ('issue_2', 'ws_pm', 'proj_pm', 'epic_1', 'I-2', 'Review task', 'in_review', 'active', 'medium')
  `).run()
  db.prepare(`
    INSERT INTO plans (plan_id, workspace_id, project_id, display_id, title, status, status_category, file_path)
    VALUES ('plan_1', 'ws_pm', 'proj_pm', 'P-1', 'PM dashboard plan', 'active', 'active', 'docs/plans/pm.md')
  `).run()
  db.prepare(`
    INSERT INTO reviews (review_id, workspace_id, project_id, display_id, target_type, target_id, status)
    VALUES ('review_1', 'ws_pm', 'proj_pm', 'R-1', 'task', 'task_1', 'pending')
  `).run()
  db.prepare(`
    INSERT INTO tasks (task_id, workspace_id, project_id, display_id, title, status, status_category, priority)
    VALUES ('task_1', 'ws_pm', 'proj_pm', 'T-1', 'Blocked implementation', 'blocked', 'blocked', 'high')
  `).run()
  db.prepare(`
    INSERT INTO agent_runs (run_id, workspace_id, task_id, role, status, started_at, updated_at)
    VALUES ('run_1', 'ws_pm', 'task_1', 'software_engineer', 'blocked', datetime('now'), datetime('now'))
  `).run()

  server = startMonitorServer({ workspace_id: 'ws_pm', bypass_auth: true })
})

afterEach(async () => {
  await server.stop()
  db.close()
})

describe('GET /pm/overview', () => {
  it('returns planning counts, blocker counts, and focus lists', async () => {
    const res = await server.fetch(new Request('http://localhost/pm/overview')) as Response
    expect(res.status).toBe(200)

    const json = await res.json() as {
      data: {
        epics: { active: number }
        issues: { blocked: number; in_review: number }
        plans: { active: number }
        reviews: { pending: number }
        blockers: { tasks: number; issues: number; runs: number }
        focus: { blocked_issues: Array<{ title: string }>; active_plans: Array<{ title: string }>; pending_reviews: Array<{ review_id: string }> }
      }
    }

    expect(json.data.epics.active).toBe(1)
    expect(json.data.issues.blocked).toBe(1)
    expect(json.data.issues.in_review).toBe(1)
    expect(json.data.plans.active).toBe(1)
    expect(json.data.reviews.pending).toBe(1)
    expect(json.data.blockers).toEqual({ tasks: 1, issues: 1, runs: 1 })
    expect(json.data.focus.blocked_issues[0]?.title).toBe('Blocked task')
    expect(json.data.focus.active_plans[0]?.title).toBe('PM dashboard plan')
    expect(json.data.focus.pending_reviews[0]?.review_id).toBe('review_1')
  })
})
