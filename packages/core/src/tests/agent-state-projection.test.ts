import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { createTask } from '../tasks.js'
import { startAgentRun, completeAgentRun, blockAgentRun, heartbeatAgentRun } from '../runs.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_1','test ws')").run()
  db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_1','ws_1','test proj')").run()
}

async function seedTask() {
  seed()
  return createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'A task' })
}

describe('agent_state_projection', () => {
  it('inserts a projection row on startAgentRun with correct status', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ workspace_id: 'ws_1', task_id: task.task_id, role: 'implementer' })

    const db = getDb()
    const row = db.prepare('SELECT * FROM agent_state_projection WHERE run_id = ?').get(run.run_id) as Record<string, unknown> | undefined
    expect(row).toBeDefined()
    expect(row!.status).toBe('running')
    expect(row!.workspace_id).toBe('ws_1')
    expect(row!.task_id).toBe(task.task_id)
  })

  it('updates projection row status after completeAgentRun', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ workspace_id: 'ws_1', task_id: task.task_id, role: 'implementer' })

    await completeAgentRun({ run_id: run.run_id, output_summary: 'done' })

    const db = getDb()
    const row = db.prepare('SELECT * FROM agent_state_projection WHERE run_id = ?').get(run.run_id) as Record<string, unknown> | undefined
    expect(row).toBeDefined()
    expect(row!.status).toBe('finished')
  })

  it('updates projection row status after blockAgentRun', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ workspace_id: 'ws_1', task_id: task.task_id, role: 'implementer' })

    await blockAgentRun({ run_id: run.run_id, reason: 'waiting on something' })

    const db = getDb()
    const row = db.prepare('SELECT * FROM agent_state_projection WHERE run_id = ?').get(run.run_id) as Record<string, unknown> | undefined
    expect(row).toBeDefined()
    expect(row!.status).toBe('blocked')
    expect(row!.blocker).toBe('waiting on something')
  })

  it('updates projection row heartbeat fields after heartbeatAgentRun', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ workspace_id: 'ws_1', task_id: task.task_id, role: 'implementer' })

    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'building', progress_pct: 50 })

    const db = getDb()
    const row = db.prepare('SELECT * FROM agent_state_projection WHERE run_id = ?').get(run.run_id) as Record<string, unknown> | undefined
    expect(row).toBeDefined()
    expect(row!.heartbeat_at).not.toBeNull()
    expect(row!.current_step).toBe('building')
    expect(row!.progress_pct).toBe(50)
  })

  it('INSERT OR REPLACE keeps exactly one row per run (no duplicates)', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ workspace_id: 'ws_1', task_id: task.task_id, role: 'implementer' })

    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'step1', progress_pct: 10 })
    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'step2', progress_pct: 20 })
    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'step3', progress_pct: 30 })

    const db = getDb()
    const count = (db.prepare('SELECT COUNT(*) as cnt FROM agent_state_projection WHERE run_id = ?').get(run.run_id) as { cnt: number }).cnt
    expect(count).toBe(1)

    const row = db.prepare('SELECT * FROM agent_state_projection WHERE run_id = ?').get(run.run_id) as Record<string, unknown> | undefined
    expect(row!.progress_pct).toBe(30)
    expect(row!.current_step).toBe('step3')
  })

  it('projection row count equals distinct run count', async () => {
    seed()
    const task1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Task 1' })
    const task2 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Task 2' })

    await startAgentRun({ workspace_id: 'ws_1', task_id: task1.task_id, role: 'implementer' })
    await startAgentRun({ workspace_id: 'ws_1', task_id: task2.task_id, role: 'implementer' })

    const db = getDb()
    const runCount = (db.prepare('SELECT COUNT(*) as cnt FROM agent_runs').get() as { cnt: number }).cnt
    const projCount = (db.prepare('SELECT COUNT(*) as cnt FROM agent_state_projection').get() as { cnt: number }).cnt
    expect(projCount).toBe(runCount)
  })
})
