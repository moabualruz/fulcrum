import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { createTask } from '../tasks.js'
import { startAgentRun, blockAgentRun } from '../runs.js'
import { runJanitorCycle } from '../janitor.js'
import type { PolicyConfig } from '../types.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

const policy: PolicyConfig = {
  wip_limit: 10,
  wip_limit_per_role: {},
  heartbeat_timeout_minutes: 0, // 0 = mark stale immediately in tests
  escalation_timeout_minutes: 0, // 0 = escalate immediately in tests
}

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces VALUES ('ws_1','test',datetime('now'))").run()
  db.prepare("INSERT INTO projects VALUES ('proj_1','ws_1','test',datetime('now'))").run()
}

describe('runJanitorCycle — invalid policy', () => {
  it('throws invalid_input for negative heartbeat_timeout_minutes', async () => {
    seed()
    await expect(
      runJanitorCycle({
        workspace_id: 'ws_1',
        policy: { ...policy, heartbeat_timeout_minutes: -1 },
      })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('throws invalid_input for negative escalation_timeout_minutes', async () => {
    seed()
    await expect(
      runJanitorCycle({
        workspace_id: 'ws_1',
        policy: { ...policy, escalation_timeout_minutes: -1 },
      })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })
})

describe('runJanitorCycle', () => {
  it('marks running runs stale when heartbeat timeout exceeded', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    const run = await startAgentRun({ task_id: t.task_id, workspace_id: 'ws_1', role: 'implementer' })

    // Backdating updated_at to simulate timeout
    const db = getDb()
    db.prepare("UPDATE agent_runs SET updated_at = datetime('now', '-60 minutes') WHERE run_id = ?").run(run.run_id)

    await runJanitorCycle({ workspace_id: 'ws_1', policy })

    const updated = db.prepare('SELECT status FROM agent_runs WHERE run_id = ?').get(run.run_id) as { status: string }
    expect(updated.status).toBe('stale')
  })

  it('auto-escalates blocked runs past escalation timeout', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    const run = await startAgentRun({ task_id: t.task_id, workspace_id: 'ws_1', role: 'implementer' })
    await blockAgentRun({ run_id: run.run_id, reason: 'stuck' })

    const db = getDb()
    db.prepare("UPDATE agent_runs SET updated_at = datetime('now', '-120 minutes') WHERE run_id = ?").run(run.run_id)

    await runJanitorCycle({ workspace_id: 'ws_1', policy })

    const updated = db.prepare('SELECT status FROM agent_runs WHERE run_id = ?').get(run.run_id) as { status: string }
    expect(updated.status).toBe('escalated')

    // Should have created a CoS task
    const cosTasks = db.prepare("SELECT * FROM tasks WHERE assigned_to = 'chief_of_staff'").all()
    expect(cosTasks.length).toBeGreaterThan(0)
  })
})
