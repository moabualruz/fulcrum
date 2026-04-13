// packages/monitor/src/tests/monitor.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb } from '@fulcrum/core'
import { runMigration009 } from '../schema.js'
import {
  recordDailyMetrics,
  getMetrics,
  getBurndown,
  getAgentMetrics,
  replayRun,
} from '../metrics.js'
import { startMonitorServer } from '../server.js'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Minimal prerequisite tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      workspace_id TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS projects (
      project_id   TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      task_id      TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id   TEXT NOT NULL,
      title        TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'queued',
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

  // Seed workspace and project
  db.prepare(`INSERT INTO workspaces (workspace_id, name) VALUES ('ws_test', 'Test Workspace')`).run()
  db.prepare(`INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_test', 'ws_test', 'Test Project')`).run()

  return db
}

let db: Database.Database

beforeEach(() => {
  db = createTestDb()
  setDb(db)
})

describe('recordDailyMetrics', () => {
  it('inserts a row and can be retrieved', async () => {
    await recordDailyMetrics({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      date: '2026-04-13',
      issues_created: 3,
      issues_closed: 1,
      tasks_created: 10,
      tasks_completed: 4,
      tasks_blocked: 2,
      runs_started: 8,
      runs_finished: 6,
      runs_failed: 1,
      memory_writes: 50,
      memory_recalls: 120,
    })

    const row = db
      .prepare(`SELECT * FROM analytics_daily WHERE workspace_id = ? AND date = ?`)
      .get('ws_test', '2026-04-13') as Record<string, unknown> | undefined

    expect(row).toBeDefined()
    expect(row!.tasks_completed).toBe(4)
    expect(row!.runs_failed).toBe(1)
    expect(row!.memory_recalls).toBe(120)
  })

  it('replaces an existing row on duplicate (workspace_id, project_id, date)', async () => {
    await recordDailyMetrics({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      date: '2026-04-13',
      issues_created: 1,
      issues_closed: 0,
      tasks_created: 2,
      tasks_completed: 1,
      tasks_blocked: 0,
      runs_started: 3,
      runs_finished: 3,
      runs_failed: 0,
      memory_writes: 10,
      memory_recalls: 20,
    })

    // Replace with updated counts
    await recordDailyMetrics({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      date: '2026-04-13',
      issues_created: 5,
      issues_closed: 2,
      tasks_created: 9,
      tasks_completed: 7,
      tasks_blocked: 1,
      runs_started: 10,
      runs_finished: 9,
      runs_failed: 1,
      memory_writes: 30,
      memory_recalls: 60,
    })

    const rows = db
      .prepare(`SELECT * FROM analytics_daily WHERE workspace_id = ? AND date = ?`)
      .all('ws_test', '2026-04-13') as Array<Record<string, unknown>>

    // Only one row — replaced, not duplicated
    expect(rows).toHaveLength(1)
    expect(rows[0].tasks_completed).toBe(7)
    expect(rows[0].issues_created).toBe(5)
  })
})

describe('getMetrics', () => {
  it('filters by workspace_id and date range', async () => {
    // Insert three rows across two dates
    await recordDailyMetrics({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      date: '2026-04-10',
      issues_created: 1, issues_closed: 0,
      tasks_created: 2, tasks_completed: 1, tasks_blocked: 0,
      runs_started: 3, runs_finished: 2, runs_failed: 0,
      memory_writes: 5, memory_recalls: 10,
    })
    await recordDailyMetrics({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      date: '2026-04-11',
      issues_created: 2, issues_closed: 1,
      tasks_created: 4, tasks_completed: 2, tasks_blocked: 1,
      runs_started: 5, runs_finished: 4, runs_failed: 0,
      memory_writes: 8, memory_recalls: 20,
    })
    await recordDailyMetrics({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      date: '2026-04-15',  // outside the range we'll query
      issues_created: 0, issues_closed: 0,
      tasks_created: 1, tasks_completed: 0, tasks_blocked: 0,
      runs_started: 1, runs_finished: 0, runs_failed: 0,
      memory_writes: 1, memory_recalls: 2,
    })

    const result = await getMetrics({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      start_date: '2026-04-10',
      end_date: '2026-04-12',
    })

    // Only the first two rows fall within the date range
    expect(result.daily).toHaveLength(2)
    const dates = result.daily.map((d) => d.date)
    expect(dates).toContain('2026-04-10')
    expect(dates).toContain('2026-04-11')
    expect(dates).not.toContain('2026-04-15')
  })
})

describe('getBurndown', () => {
  it('returns BurndownData with correct points structure', async () => {
    // Seed tasks: 3 total, 1 completed on 2026-04-11
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at) VALUES (?, 'ws_test', 'proj_test', 'Task A', 'queued',    '2026-04-10T00:00:00.000Z', '2026-04-10T00:00:00.000Z')`).run('task_001')
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at) VALUES (?, 'ws_test', 'proj_test', 'Task B', 'queued',    '2026-04-10T00:00:00.000Z', '2026-04-10T00:00:00.000Z')`).run('task_002')
    db.prepare(`INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at) VALUES (?, 'ws_test', 'proj_test', 'Task C', 'completed', '2026-04-10T00:00:00.000Z', '2026-04-11T00:00:00.000Z')`).run('task_003')

    const burndown = await getBurndown({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      start_date: '2026-04-10',
      end_date: '2026-04-12',
    })

    expect(burndown.project_id).toBe('proj_test')
    expect(burndown.start_date).toBe('2026-04-10')
    expect(burndown.end_date).toBe('2026-04-12')
    expect(Array.isArray(burndown.points)).toBe(true)
    expect(burndown.points.length).toBeGreaterThan(0)

    // Every point must have required fields
    burndown.points.forEach((p) => {
      expect(typeof p.date).toBe('string')
      expect(typeof p.total).toBe('number')
      expect(typeof p.completed).toBe('number')
      expect(typeof p.remaining).toBe('number')
      expect(p.remaining).toBe(p.total - p.completed)
    })
  })
})

describe('getAgentMetrics', () => {
  it('filters by agent_id and date range', async () => {
    const now = '2026-04-13'
    const past = '2026-04-01'

    db.prepare(`
      INSERT INTO analytics_agent
        (id, workspace_id, agent_id, date, runs_started, runs_completed, runs_blocked, runs_failed, avg_duration_min, handoff_count)
      VALUES (?, 'ws_test', 'agent_alpha', ?, 5, 4, 1, 0, 12.5, 2)
    `).run('aa_001', now)

    db.prepare(`
      INSERT INTO analytics_agent
        (id, workspace_id, agent_id, date, runs_started, runs_completed, runs_blocked, runs_failed, avg_duration_min, handoff_count)
      VALUES (?, 'ws_test', 'agent_alpha', ?, 2, 2, 0, 0, 8.0, 1)
    `).run('aa_002', past)

    db.prepare(`
      INSERT INTO analytics_agent
        (id, workspace_id, agent_id, date, runs_started, runs_completed, runs_blocked, runs_failed, avg_duration_min, handoff_count)
      VALUES (?, 'ws_test', 'agent_beta', ?, 3, 3, 0, 0, 5.0, 0)
    `).run('ab_001', now)

    // Filter by agent_id only
    const alphaMetrics = await getAgentMetrics({
      workspace_id: 'ws_test',
      agent_id: 'agent_alpha',
    })

    expect(alphaMetrics.length).toBe(2)
    alphaMetrics.forEach((m) => expect(m.agent_id).toBe('agent_alpha'))

    // Filter by agent_id + date range (only the 'now' date)
    const recentAlpha = await getAgentMetrics({
      workspace_id: 'ws_test',
      agent_id: 'agent_alpha',
      start_date: '2026-04-12',
      end_date: '2026-04-14',
    })

    expect(recentAlpha).toHaveLength(1)
    expect(recentAlpha[0].date).toBe(now)
    expect(recentAlpha[0].runs_started).toBe(5)
    expect(recentAlpha[0].avg_duration_min).toBe(12.5)
  })
})

describe('replayRun', () => {
  it('returns events for a given run_id ordered by ts ASC', async () => {
    const run_id = 'run_replay_001'

    db.prepare(`
      INSERT INTO events (event_id, workspace_id, event_type, payload, ts)
      VALUES (?, 'ws_test', 'run_step_completed', ?, ?)
    `).run('evt_001', JSON.stringify({ run_id, step: 1 }), '2026-04-13T10:00:00.000Z')

    db.prepare(`
      INSERT INTO events (event_id, workspace_id, event_type, payload, ts)
      VALUES (?, 'ws_test', 'run_step_completed', ?, ?)
    `).run('evt_002', JSON.stringify({ run_id, step: 2 }), '2026-04-13T10:01:00.000Z')

    db.prepare(`
      INSERT INTO events (event_id, workspace_id, event_type, payload, ts)
      VALUES (?, 'ws_test', 'run_finished', ?, ?)
    `).run('evt_003', JSON.stringify({ run_id, result: 'ok' }), '2026-04-13T10:02:00.000Z')

    // Insert an event for a DIFFERENT run — must not be returned
    db.prepare(`
      INSERT INTO events (event_id, workspace_id, event_type, payload, ts)
      VALUES (?, 'ws_test', 'run_finished', ?, ?)
    `).run('evt_999', JSON.stringify({ run_id: 'run_other', result: 'ok' }), '2026-04-13T10:03:00.000Z')

    const replay = await replayRun({ run_id })

    expect(replay.run_id).toBe(run_id)
    expect(replay.events).toHaveLength(3)
    expect(replay.events[0].event_id).toBe('evt_001')
    expect(replay.events[1].event_id).toBe('evt_002')
    expect(replay.events[2].event_id).toBe('evt_003')
    replay.events.forEach((e) => {
      expect(e.event_id).toBeDefined()
      expect(e.event_type).toBeDefined()
      expect(e.ts).toBeDefined()
    })
  })
})

describe('MonitorServer', () => {
  it.skipIf(!process.env.FULCRUM_SERVER_TESTS)(
    'starts and responds to GET /status',
    async () => {
      const server = startMonitorServer({ port: 17331, workspace_id: 'ws_test' })
      await server.start()

      try {
        const res = await fetch('http://127.0.0.1:17331/status')
        expect(res.ok).toBe(true)

        const body = await res.json() as Record<string, unknown>
        expect(body).toHaveProperty('workspace_id')
        expect(body.workspace_id).toBe('ws_test')
      } finally {
        await server.stop()
      }
    }
  )
})
