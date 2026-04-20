import { describe, expect, it, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { applySchema } from '../db/schema.js'
import {
  isTrustedSession,
  recordRecall,
  recordGrepWithoutRecall,
  getTurnState,
} from '../recall-turn-state.js'

function newDb(): Database.Database {
  const db = new Database(':memory:')
  applySchema(db)
  return db
}

function seedAgentRun(db: Database.Database, runId: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO workspaces (workspace_id, name) VALUES ('ws_test', 'test')`,
  ).run()
  db.prepare(
    `INSERT OR IGNORE INTO projects (project_id, workspace_id, name)
     VALUES ('proj_test', 'ws_test', 'test-project')`,
  ).run()
  db.prepare(
    `INSERT OR IGNORE INTO tasks (task_id, workspace_id, project_id, title)
     VALUES ('task_test', 'ws_test', 'proj_test', 'test task')`,
  ).run()
  db.prepare(
    `INSERT INTO agent_runs (run_id, task_id, workspace_id, role)
     VALUES (?, 'task_test', 'ws_test', 'software_engineer')`,
  ).run(runId)
}

describe('recall-turn-state (PR 3 R1 spike)', () => {
  let db: Database.Database
  beforeEach(() => {
    db = newDb()
  })

  describe('isTrustedSession (AD-9b)', () => {
    it('returns false for empty session id', () => {
      expect(isTrustedSession(db, '')).toBe(false)
    })

    it('returns false for a session id that does not match any agent_runs row', () => {
      expect(isTrustedSession(db, 'run_forged_123')).toBe(false)
    })

    it('returns true for a session id that matches agent_runs.run_id', () => {
      seedAgentRun(db, 'run_real_123')
      expect(isTrustedSession(db, 'run_real_123')).toBe(true)
    })
  })

  describe('recordRecall', () => {
    it('refuses to write for an untrusted session (AD-9b forgery defense)', () => {
      recordRecall(db, { sessionId: 'run_forged', agentType: 'claude' })
      expect(getTurnState(db, { sessionId: 'run_forged', agentType: 'claude' })).toBeNull()
    })

    it('inserts a fresh turn-state row for a trusted session', () => {
      seedAgentRun(db, 'run_1')
      recordRecall(db, { sessionId: 'run_1', agentType: 'claude' })
      const state = getTurnState(db, { sessionId: 'run_1', agentType: 'claude' })
      expect(state).not.toBeNull()
      expect(state?.last_recall_at).toBeTruthy()
      expect(state?.grep_count_without_recall).toBe(0)
    })

    it('resets grep_count_without_recall when called after greps', () => {
      seedAgentRun(db, 'run_2')
      recordGrepWithoutRecall(db, { sessionId: 'run_2', agentType: 'claude' })
      recordGrepWithoutRecall(db, { sessionId: 'run_2', agentType: 'claude' })
      recordRecall(db, { sessionId: 'run_2', agentType: 'claude' })
      const state = getTurnState(db, { sessionId: 'run_2', agentType: 'claude' })
      expect(state?.grep_count_without_recall).toBe(0)
    })
  })

  describe('recordGrepWithoutRecall', () => {
    it('refuses to write for untrusted session and returns 0', () => {
      const count = recordGrepWithoutRecall(db, { sessionId: 'forged', agentType: 'claude' })
      expect(count).toBe(0)
    })

    it('increments the counter across calls', () => {
      seedAgentRun(db, 'run_3')
      const a = recordGrepWithoutRecall(db, { sessionId: 'run_3', agentType: 'claude' })
      const b = recordGrepWithoutRecall(db, { sessionId: 'run_3', agentType: 'claude' })
      const c = recordGrepWithoutRecall(db, { sessionId: 'run_3', agentType: 'claude' })
      expect(a).toBe(1)
      expect(b).toBe(2)
      expect(c).toBe(3)
    })

    it('scopes per (session, turn, agent_type) tuple', () => {
      seedAgentRun(db, 'run_4')
      recordGrepWithoutRecall(db, { sessionId: 'run_4', turnId: 't1', agentType: 'claude' })
      recordGrepWithoutRecall(db, { sessionId: 'run_4', turnId: 't2', agentType: 'claude' })
      expect(
        getTurnState(db, { sessionId: 'run_4', turnId: 't1', agentType: 'claude' })
          ?.grep_count_without_recall,
      ).toBe(1)
      expect(
        getTurnState(db, { sessionId: 'run_4', turnId: 't2', agentType: 'claude' })
          ?.grep_count_without_recall,
      ).toBe(1)
    })
  })

  describe('load — SQLite write p95 budget <5ms (plan performance table)', () => {
    it('1000 grep increments complete with p95 < 5ms', () => {
      seedAgentRun(db, 'run_load')
      const latencies: number[] = []
      for (let i = 0; i < 1000; i++) {
        const start = performance.now()
        recordGrepWithoutRecall(db, {
          sessionId: 'run_load',
          turnId: `t${i}`,
          agentType: 'claude',
        })
        latencies.push(performance.now() - start)
      }
      latencies.sort((a, b) => a - b)
      const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? Infinity
      expect(p95).toBeLessThan(5)
    })
  })
})
