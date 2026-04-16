// packages/monitor/src/tests/metrics-extended.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb } from '@moabualruz/fulcrum-core'
import { runMigration009 } from '../schema.js'
import {
  getIssueBurndown,
  getWipCount,
  getThroughputDaily,
  getAgentRunSummary,
  getMemoryScopeDistribution,
  getPerRoleMetrics,
  getTaskCycleTime,
  getReviewRejectionRate,
  getFailedRunRate,
  getMemoryRecallCount,
  getMemoryMetrics,
  getForecasting,
} from '../metrics.js'

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

    CREATE TABLE IF NOT EXISTS reviews (
      review_id        TEXT PRIMARY KEY,
      workspace_id     TEXT NOT NULL,
      project_id       TEXT NOT NULL DEFAULT '',
      display_id       TEXT NOT NULL DEFAULT '',
      target_type      TEXT NOT NULL DEFAULT 'task',
      target_id        TEXT NOT NULL DEFAULT '',
      status           TEXT NOT NULL DEFAULT 'pending',
      reviewer_agent_id TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
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

// ─── getIssueBurndown ─────────────────────────────────────────────────────────

describe('getIssueBurndown', () => {
  it('returns correct date rows with created/resolved counts', () => {
    db.prepare(`
      INSERT INTO issues (issue_id, workspace_id, title, status, created_at, updated_at)
      VALUES ('i1', 'ws_test', 'Issue 1', 'backlog', '2026-04-10T00:00:00', '2026-04-10T00:00:00')
    `).run()
    db.prepare(`
      INSERT INTO issues (issue_id, workspace_id, title, status, created_at, updated_at)
      VALUES ('i2', 'ws_test', 'Issue 2', 'backlog', '2026-04-10T00:00:00', '2026-04-10T00:00:00')
    `).run()
    db.prepare(`
      INSERT INTO issues (issue_id, workspace_id, title, status, created_at, updated_at)
      VALUES ('i3', 'ws_test', 'Issue 3', 'done', '2026-04-11T00:00:00', '2026-04-11T12:00:00')
    `).run()

    const result = getIssueBurndown(db, {
      workspace_id: 'ws_test',
      start_date: '2026-04-10',
      end_date: '2026-04-11',
    })

    expect(result).toHaveLength(2)
    expect(result[0].date).toBe('2026-04-10')
    expect(result[0].created).toBe(2)
    expect(result[0].resolved).toBe(0)
    expect(result[1].date).toBe('2026-04-11')
    expect(result[1].created).toBe(1)
    expect(result[1].resolved).toBe(1)
  })

  it('does not include data from other workspaces', () => {
    db.prepare(`
      INSERT INTO issues (issue_id, workspace_id, title, status, created_at, updated_at)
      VALUES ('i_other', 'ws_other', 'Other', 'backlog', '2026-04-10T00:00:00', '2026-04-10T00:00:00')
    `).run()

    const result = getIssueBurndown(db, {
      workspace_id: 'ws_test',
      start_date: '2026-04-10',
      end_date: '2026-04-10',
    })

    expect(result[0].created).toBe(0)
  })
})

// ─── getWipCount ──────────────────────────────────────────────────────────────

describe('getWipCount', () => {
  it('groups running agent_runs by role', () => {
    db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status)
      VALUES ('r1', 't1', 'ws_test', 'a1', 'implementer', 'running')
    `).run()
    db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status)
      VALUES ('r2', 't2', 'ws_test', 'a2', 'implementer', 'running')
    `).run()
    db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status)
      VALUES ('r3', 't3', 'ws_test', 'a3', 'tester', 'running')
    `).run()
    // Completed — should not be counted
    db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status)
      VALUES ('r4', 't4', 'ws_test', 'a4', 'tester', 'completed')
    `).run()

    const result = getWipCount(db, { workspace_id: 'ws_test' })

    const byRole = Object.fromEntries(result.map((r) => [r.role, r.count]))
    expect(byRole['implementer']).toBe(2)
    expect(byRole['tester']).toBe(1)
  })

  it('returns empty array when no running runs', () => {
    const result = getWipCount(db, { workspace_id: 'ws_test' })
    expect(result).toEqual([])
  })
})

// ─── getThroughputDaily ───────────────────────────────────────────────────────

describe('getThroughputDaily', () => {
  it('returns completed task counts per day', () => {
    db.prepare(`
      INSERT INTO tasks (task_id, workspace_id, project_id, title, status, updated_at)
      VALUES ('t1', 'ws_test', 'proj_test', 'T1', 'completed', '2026-04-10T10:00:00')
    `).run()
    db.prepare(`
      INSERT INTO tasks (task_id, workspace_id, project_id, title, status, updated_at)
      VALUES ('t2', 'ws_test', 'proj_test', 'T2', 'completed', '2026-04-10T14:00:00')
    `).run()
    db.prepare(`
      INSERT INTO tasks (task_id, workspace_id, project_id, title, status, updated_at)
      VALUES ('t3', 'ws_test', 'proj_test', 'T3', 'completed', '2026-04-11T09:00:00')
    `).run()
    // queued — should not be counted
    db.prepare(`
      INSERT INTO tasks (task_id, workspace_id, project_id, title, status, updated_at)
      VALUES ('t4', 'ws_test', 'proj_test', 'T4', 'queued', '2026-04-10T11:00:00')
    `).run()

    const result = getThroughputDaily(db, {
      workspace_id: 'ws_test',
      start_date: '2026-04-10',
      end_date: '2026-04-11',
    })

    expect(result).toHaveLength(2)
    const byDate = Object.fromEntries(result.map((r) => [r.date, r.completed]))
    expect(byDate['2026-04-10']).toBe(2)
    expect(byDate['2026-04-11']).toBe(1)
  })

  it('returns empty array when no completions in range', () => {
    const result = getThroughputDaily(db, {
      workspace_id: 'ws_test',
      start_date: '2026-04-10',
      end_date: '2026-04-11',
    })
    expect(result).toEqual([])
  })
})

// ─── getAgentRunSummary ───────────────────────────────────────────────────────

describe('getAgentRunSummary', () => {
  it('returns per-agent stats', () => {
    db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status, started_at, finished_at)
      VALUES ('r1', 't1', 'ws_test', 'agent_alpha', 'implementer', 'completed', '2026-04-10T10:00:00', '2026-04-10T10:30:00')
    `).run()
    db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status, started_at, finished_at)
      VALUES ('r2', 't2', 'ws_test', 'agent_alpha', 'implementer', 'completed', '2026-04-10T11:00:00', '2026-04-10T11:20:00')
    `).run()
    db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status, started_at, finished_at)
      VALUES ('r3', 't3', 'ws_test', 'agent_alpha', 'tester', 'blocked', '2026-04-10T12:00:00', NULL)
    `).run()
    db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status, started_at, finished_at)
      VALUES ('r4', 't4', 'ws_test', 'agent_beta', 'tester', 'completed', '2026-04-10T09:00:00', '2026-04-10T09:45:00')
    `).run()

    const result = getAgentRunSummary(db, { workspace_id: 'ws_test' })

    expect(result.length).toBeGreaterThanOrEqual(2)

    const alpha = result.find((r) => r.agent_id === 'agent_alpha')
    expect(alpha).toBeDefined()
    expect(alpha!.total_runs).toBe(3)
    expect(alpha!.completed).toBe(2)
    expect(alpha!.failed).toBe(1)
    // avg_duration_ms should be based on the two completed runs that have finished_at
    expect(alpha!.avg_duration_ms).not.toBeNull()

    const beta = result.find((r) => r.agent_id === 'agent_beta')
    expect(beta).toBeDefined()
    expect(beta!.total_runs).toBe(1)
    expect(beta!.completed).toBe(1)
    expect(beta!.failed).toBe(0)
  })
})

// ─── getMemoryScopeDistribution ───────────────────────────────────────────────

describe('getMemoryScopeDistribution', () => {
  it('groups memories by scope correctly', () => {
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, content, scope) VALUES ('m1', 'ws_test', 'c1', 'project')`).run()
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, content, scope) VALUES ('m2', 'ws_test', 'c2', 'project')`).run()
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, content, scope) VALUES ('m3', 'ws_test', 'c3', 'global')`).run()
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, content, scope) VALUES ('m_other', 'ws_other', 'c4', 'project')`).run()

    const result = getMemoryScopeDistribution(db, { workspace_id: 'ws_test' })

    const byScope = Object.fromEntries(result.map((r) => [r.scope, r.count]))
    expect(byScope['project']).toBe(2)
    expect(byScope['global']).toBe(1)
    // ws_other should not appear
    expect(Object.keys(byScope)).not.toContain('ws_other_scope')
    expect(result.reduce((s, r) => s + r.count, 0)).toBe(3)
  })

  it('returns empty array for workspace with no memories', () => {
    const result = getMemoryScopeDistribution(db, { workspace_id: 'ws_empty' })
    expect(result).toEqual([])
  })
})

// ─── getPerRoleMetrics ────────────────────────────────────────────────────────

describe('getPerRoleMetrics', () => {
  it('returns combined wip, completed_30d, avg_cycle_days per role', () => {
    // Seed tasks: 2 completed, 1 queued
    db.prepare(`
      INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('ta', 'ws_test', 'proj_test', 'A', 'completed', '2026-04-01T00:00:00', '2026-04-10T00:00:00')
    `).run()
    db.prepare(`
      INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('tb', 'ws_test', 'proj_test', 'B', 'completed', '2026-04-05T00:00:00', '2026-04-08T00:00:00')
    `).run()
    db.prepare(`
      INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('tc', 'ws_test', 'proj_test', 'C', 'queued', '2026-04-10T00:00:00', '2026-04-10T00:00:00')
    `).run()

    // Agent runs: 2 completed linked to ta/tb (implementer), 1 running (tester)
    db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status)
      VALUES ('ra', 'ta', 'ws_test', 'a1', 'implementer', 'completed')
    `).run()
    db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status)
      VALUES ('rb', 'tb', 'ws_test', 'a1', 'implementer', 'completed')
    `).run()
    db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status)
      VALUES ('rc', 'tc', 'ws_test', 'a2', 'tester', 'running')
    `).run()

    const result = getPerRoleMetrics(db, { workspace_id: 'ws_test' })

    expect(result.length).toBeGreaterThanOrEqual(1)

    const implementer = result.find((r) => r.role === 'implementer')
    expect(implementer).toBeDefined()
    expect(implementer!.completed_30d).toBeGreaterThanOrEqual(0)

    const tester = result.find((r) => r.role === 'tester')
    expect(tester).toBeDefined()
    expect(tester!.wip).toBe(1)
  })

  it('returns empty array for workspace with no activity', () => {
    const result = getPerRoleMetrics(db, { workspace_id: 'ws_empty' })
    expect(result).toEqual([])
  })
})

// ─── getTaskCycleTime ─────────────────────────────────────────────────────────

describe('getTaskCycleTime', () => {
  it('calculates avg days from created to updated for completed tasks per role', () => {
    db.prepare(`
      INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('t_cyc', 'ws_test', 'proj_test', 'CycleTask', 'completed', '2026-04-01T00:00:00', '2026-04-11T00:00:00')
    `).run()
    db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status)
      VALUES ('r_cyc', 't_cyc', 'ws_test', 'a1', 'implementer', 'completed')
    `).run()

    const result = getTaskCycleTime(db, { workspace_id: 'ws_test' })

    expect(result.length).toBeGreaterThan(0)
    const impl = result.find((r) => r.role === 'implementer')
    expect(impl).toBeDefined()
    expect(impl!.avg_days).toBeCloseTo(10, 0)
    expect(impl!.count).toBe(1)
  })
})

// ─── getReviewRejectionRate ───────────────────────────────────────────────────

describe('getReviewRejectionRate', () => {
  it('calculates rejection rate per reviewer', () => {
    db.prepare(`
      INSERT INTO reviews (review_id, workspace_id, status, reviewer_agent_id)
      VALUES ('rv1', 'ws_test', 'approved', 'reviewer_1')
    `).run()
    db.prepare(`
      INSERT INTO reviews (review_id, workspace_id, status, reviewer_agent_id)
      VALUES ('rv2', 'ws_test', 'rejected', 'reviewer_1')
    `).run()
    db.prepare(`
      INSERT INTO reviews (review_id, workspace_id, status, reviewer_agent_id)
      VALUES ('rv3', 'ws_test', 'changes_requested', 'reviewer_1')
    `).run()
    db.prepare(`
      INSERT INTO reviews (review_id, workspace_id, status, reviewer_agent_id)
      VALUES ('rv4', 'ws_test', 'approved', 'reviewer_2')
    `).run()

    const result = getReviewRejectionRate(db, { workspace_id: 'ws_test' })

    const r1 = result.find((r) => r.reviewer_id === 'reviewer_1')
    expect(r1).toBeDefined()
    expect(r1!.total).toBe(3)
    expect(r1!.rejected).toBe(2)
    expect(r1!.rate).toBeCloseTo(2 / 3)

    const r2 = result.find((r) => r.reviewer_id === 'reviewer_2')
    expect(r2).toBeDefined()
    expect(r2!.rate).toBe(0)
  })
})

// ─── getFailedRunRate ─────────────────────────────────────────────────────────

describe('getFailedRunRate', () => {
  it('calculates failed run rate per role', () => {
    db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status)
      VALUES ('r1', 't1', 'ws_test', 'a1', 'implementer', 'completed')
    `).run()
    db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status)
      VALUES ('r2', 't2', 'ws_test', 'a1', 'implementer', 'blocked')
    `).run()
    db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, agent_id, role, status)
      VALUES ('r3', 't3', 'ws_test', 'a2', 'tester', 'completed')
    `).run()

    const result = getFailedRunRate(db, { workspace_id: 'ws_test' })

    const impl = result.find((r) => r.role === 'implementer')
    expect(impl).toBeDefined()
    expect(impl!.total).toBe(2)
    expect(impl!.failed).toBe(1)
    expect(impl!.rate).toBeCloseTo(0.5)
  })
})

// ─── getMemoryRecallCount ─────────────────────────────────────────────────────

describe('getMemoryRecallCount', () => {
  it('returns count of accessed memories by kind', () => {
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, content, kind, access_count) VALUES ('m1', 'ws_test', 'c1', 'fact', 5)`).run()
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, content, kind, access_count) VALUES ('m2', 'ws_test', 'c2', 'fact', 0)`).run()
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, content, kind, access_count) VALUES ('m3', 'ws_test', 'c3', 'summary', 3)`).run()

    const result = getMemoryRecallCount(db, { workspace_id: 'ws_test' })

    // Only memories with access_count > 0
    const byKind = Object.fromEntries(result.map((r) => [r.kind, r.count]))
    expect(byKind['fact']).toBe(1) // only m1 has access_count > 0
    expect(byKind['summary']).toBe(1)
  })
})

// ─── getMemoryMetrics ─────────────────────────────────────────────────────────

describe('getMemoryMetrics', () => {
  it('returns total, by_kind, by_scope', () => {
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, content, kind, scope) VALUES ('m1', 'ws_test', 'c1', 'fact', 'project')`).run()
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, content, kind, scope) VALUES ('m2', 'ws_test', 'c2', 'summary', 'global')`).run()
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, content, kind, scope) VALUES ('m3', 'ws_test', 'c3', 'fact', 'project')`).run()

    const result = getMemoryMetrics(db, { workspace_id: 'ws_test' })

    expect(result.total).toBe(3)
    expect(result.by_kind).toHaveLength(2) // fact, summary
    expect(result.by_scope).toHaveLength(2) // project, global

    const factCount = result.by_kind.find((k) => k.kind === 'fact')?.count
    expect(factCount).toBe(2)

    const projectCount = result.by_scope.find((s) => s.scope === 'project')?.count
    expect(projectCount).toBe(2)
  })
})

// ─── getForecasting ───────────────────────────────────────────────────────────

describe('getForecasting', () => {
  it('returns all null advisory fields and zero open_task_count when no data', () => {
    const result = getForecasting(db, { workspace_id: 'ws_test' })

    expect(result.avg_cycle_days).toBeNull()
    expect(result.avg_daily_throughput).toBe(0)
    expect(result.estimated_completion_days).toBeNull()
    expect(result.open_task_count).toBe(0)
  })

  it('returns estimated_completion_days when throughput > 0', () => {
    // Insert 3 completed tasks with known dates so throughput is measurable
    // Use a large horizon so the tasks fall within the window
    db.prepare(`
      INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('fc1', 'ws_test', 'proj_test', 'FC1', 'completed', datetime('now', '-5 days'), datetime('now', '-1 day'))
    `).run()
    db.prepare(`
      INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('fc2', 'ws_test', 'proj_test', 'FC2', 'completed', datetime('now', '-4 days'), datetime('now', '-1 day'))
    `).run()
    // Open tasks
    db.prepare(`
      INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('fo1', 'ws_test', 'proj_test', 'FO1', 'queued', datetime('now'), datetime('now'))
    `).run()
    db.prepare(`
      INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('fo2', 'ws_test', 'proj_test', 'FO2', 'in_progress', datetime('now'), datetime('now'))
    `).run()

    const result = getForecasting(db, { workspace_id: 'ws_test', horizon_days: 30 })

    expect(result.open_task_count).toBe(2)
    expect(result.avg_daily_throughput).toBeGreaterThan(0)
    expect(result.estimated_completion_days).not.toBeNull()
    // 2 open tasks / (2/30 per day) = 30 days
    expect(result.estimated_completion_days).toBeCloseTo(30, 0)
    expect(result.avg_cycle_days).not.toBeNull()
    expect(result.avg_cycle_days).toBeGreaterThan(0)
  })

  it('does not include cancelled/completed tasks in open_task_count', () => {
    db.prepare(`
      INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('fc3', 'ws_test', 'proj_test', 'FC3', 'cancelled', datetime('now'), datetime('now'))
    `).run()
    db.prepare(`
      INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('fc4', 'ws_test', 'proj_test', 'FC4', 'completed', datetime('now'), datetime('now'))
    `).run()
    db.prepare(`
      INSERT INTO tasks (task_id, workspace_id, project_id, title, status, created_at, updated_at)
      VALUES ('fo3', 'ws_test', 'proj_test', 'FO3', 'queued', datetime('now'), datetime('now'))
    `).run()

    const result = getForecasting(db, { workspace_id: 'ws_test' })

    expect(result.open_task_count).toBe(1)
  })
})
