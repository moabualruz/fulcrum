// packages/monitor/src/tests/metrics.rollup.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb } from '@fulcrum/core'
import { runMigration009 } from '../schema.js'
import { rollupDaily } from '../metrics.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = OFF') // Off so we can insert without satisfying all FKs

  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      workspace_id TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active',
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      project_id   TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name         TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active',
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      task_id        TEXT PRIMARY KEY,
      workspace_id   TEXT NOT NULL,
      project_id     TEXT NOT NULL,
      title          TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'queued',
      status_category TEXT NOT NULL DEFAULT 'backlog',
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      run_id       TEXT PRIMARY KEY,
      task_id      TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      agent_id     TEXT NOT NULL DEFAULT '',
      role         TEXT NOT NULL DEFAULT 'implementer',
      status       TEXT NOT NULL DEFAULT 'running',
      started_at   TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at  TEXT,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memories (
      memory_id    TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id   TEXT NOT NULL DEFAULT '',
      content      TEXT NOT NULL,
      kind         TEXT NOT NULL DEFAULT 'fact',
      scope        TEXT NOT NULL DEFAULT 'project',
      access_count INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS issues (
      issue_id     TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id   TEXT NOT NULL DEFAULT '',
      display_id   TEXT NOT NULL DEFAULT '',
      title        TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'backlog',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      event_id     TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      event_type   TEXT NOT NULL,
      payload      TEXT NOT NULL DEFAULT '{}',
      ts           TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  runMigration009(db)

  db.prepare(`INSERT INTO workspaces (workspace_id, name) VALUES ('ws_test', 'Test')`).run()
  db.prepare(`INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_test', 'ws_test', 'Test')`).run()

  return db
}

let db: Database.Database

beforeEach(() => {
  db = createTestDb()
  setDb(db)
})

// ─── rollupDaily ──────────────────────────────────────────────────────────────

describe('rollupDaily', () => {
  const DATE = '2026-04-10'
  const D_START = '2026-04-10T00:00:00.000Z'
  const D_END   = '2026-04-11T00:00:00.000Z'

  it('computes correct counts and writes to analytics_daily', async () => {
    // issues_created: 2 created on the date
    db.prepare(`INSERT INTO issues (issue_id, workspace_id, title, status, created_at, updated_at)
      VALUES ('i1', 'ws_test', 'I1', 'backlog', '2026-04-10T08:00:00.000Z', '2026-04-10T08:00:00.000Z')`).run()
    db.prepare(`INSERT INTO issues (issue_id, workspace_id, title, status, created_at, updated_at)
      VALUES ('i2', 'ws_test', 'I2', 'backlog', '2026-04-10T12:00:00.000Z', '2026-04-10T12:00:00.000Z')`).run()

    // issues_closed: 1 with status='done' updated on the date
    db.prepare(`INSERT INTO issues (issue_id, workspace_id, title, status, created_at, updated_at)
      VALUES ('i3', 'ws_test', 'I3', 'done', '2026-04-09T00:00:00.000Z', '2026-04-10T15:00:00.000Z')`).run()

    // tasks_created: 3 on the date
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('t1', 'ws_test', 'proj_test', 'T1', 'queued', '2026-04-10T06:00:00.000Z', '2026-04-10T06:00:00.000Z')`).run()
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('t2', 'ws_test', 'proj_test', 'T2', 'queued', '2026-04-10T07:00:00.000Z', '2026-04-10T07:00:00.000Z')`).run()
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('t3', 'ws_test', 'proj_test', 'T3', 'queued', '2026-04-10T08:00:00.000Z', '2026-04-10T08:00:00.000Z')`).run()

    // tasks_completed: 1 with status='completed' updated on the date
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('t4', 'ws_test', 'proj_test', 'T4', 'completed', '2026-04-09T00:00:00.000Z', '2026-04-10T10:00:00.000Z')`).run()

    // tasks_blocked: 1 with status='blocked' updated on the date
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('t5', 'ws_test', 'proj_test', 'T5', 'blocked', '2026-04-09T00:00:00.000Z', '2026-04-10T11:00:00.000Z')`).run()

    // runs_started: 2 created on the date
    db.prepare(`INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status, started_at)
      VALUES ('r1', 't1', 'ws_test', 'a1', 'implementer', 'running', '2026-04-10T09:00:00.000Z')`).run()
    db.prepare(`INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status, started_at)
      VALUES ('r2', 't2', 'ws_test', 'a1', 'implementer', 'running', '2026-04-10T10:00:00.000Z')`).run()

    // runs_finished: 1 with status='completed' and updated_at on the date
    db.prepare(`INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status, started_at, updated_at)
      VALUES ('r3', 't3', 'ws_test', 'a2', 'tester', 'completed', '2026-04-09T00:00:00.000Z', '2026-04-10T14:00:00.000Z')`).run()

    // runs_failed: 1 with status='failed' and updated_at on the date
    db.prepare(`INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status, started_at, updated_at)
      VALUES ('r4', 't4', 'ws_test', 'a2', 'tester', 'failed', '2026-04-09T00:00:00.000Z', '2026-04-10T16:00:00.000Z')`).run()

    // memory_writes: 2 created on the date
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, content, created_at)
      VALUES ('m1', 'ws_test', 'fact1', '2026-04-10T07:00:00.000Z')`).run()
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, content, created_at)
      VALUES ('m2', 'ws_test', 'fact2', '2026-04-10T08:00:00.000Z')`).run()

    await rollupDaily({ workspace_id: 'ws_test', date: DATE })

    const row = db.prepare(
      `SELECT * FROM analytics_daily WHERE workspace_id = ? AND date = ?`
    ).get('ws_test', DATE) as Record<string, number>

    expect(row).toBeDefined()
    expect(row.issues_created).toBe(2)
    expect(row.issues_closed).toBe(1)
    expect(row.tasks_created).toBe(3)
    expect(row.tasks_completed).toBe(1)
    expect(row.tasks_blocked).toBe(1)
    expect(row.runs_started).toBe(2)
    expect(row.runs_finished).toBe(1)
    expect(row.runs_failed).toBe(1)
    expect(row.memory_writes).toBe(2)
    // memory_recalls defaults to 0 (no events table entries)
    expect(row.memory_recalls).toBe(0)
  })

  it('does not include data from other workspaces', async () => {
    // Data for other workspace on same date
    db.prepare(`INSERT INTO issues (issue_id, workspace_id, title, status, created_at, updated_at)
      VALUES ('i_other', 'ws_other', 'Other', 'backlog', '2026-04-10T08:00:00.000Z', '2026-04-10T08:00:00.000Z')`).run()
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('t_other', 'ws_other', 'proj_other', 'Other', 'completed', '2026-04-10T06:00:00.000Z', '2026-04-10T06:00:00.000Z')`).run()

    await rollupDaily({ workspace_id: 'ws_test', date: DATE })

    const row = db.prepare(
      `SELECT * FROM analytics_daily WHERE workspace_id = ? AND date = ?`
    ).get('ws_test', DATE) as Record<string, number>

    expect(row).toBeDefined()
    expect(row.issues_created).toBe(0)
    expect(row.tasks_created).toBe(0)
    expect(row.tasks_completed).toBe(0)
  })

  it('does not count data outside the date window', async () => {
    // Data one day before the target date
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('t_before', 'ws_test', 'proj_test', 'Before', 'completed', '2026-04-09T23:59:59.000Z', '2026-04-09T23:59:59.000Z')`).run()
    // Data one day after the target date
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('t_after', 'ws_test', 'proj_test', 'After', 'queued', '2026-04-11T00:00:00.000Z', '2026-04-11T00:00:00.000Z')`).run()

    await rollupDaily({ workspace_id: 'ws_test', date: DATE })

    const row = db.prepare(
      `SELECT * FROM analytics_daily WHERE workspace_id = ? AND date = ?`
    ).get('ws_test', DATE) as Record<string, number>

    expect(row).toBeDefined()
    expect(row.tasks_created).toBe(0)
    expect(row.tasks_completed).toBe(0)
  })

  it('is idempotent — calling twice for the same date updates the row', async () => {
    // Insert 1 task
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('t1', 'ws_test', 'proj_test', 'T1', 'queued', '2026-04-10T06:00:00.000Z', '2026-04-10T06:00:00.000Z')`).run()

    await rollupDaily({ workspace_id: 'ws_test', date: DATE })
    await rollupDaily({ workspace_id: 'ws_test', date: DATE })

    const rows = db.prepare(
      `SELECT * FROM analytics_daily WHERE workspace_id = ? AND date = ?`
    ).all('ws_test', DATE) as Record<string, number>[]

    // Should only have one row (INSERT OR REPLACE)
    expect(rows).toHaveLength(1)
    expect(rows[0].tasks_created).toBe(1)
  })

  it('defaults date to today and does not throw', async () => {
    await expect(rollupDaily({ workspace_id: 'ws_test' })).resolves.not.toThrow()
  })
})
