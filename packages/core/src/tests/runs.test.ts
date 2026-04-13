import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { createTask } from '../tasks.js'
import {
  startAgentRun,
  heartbeatAgentRun,
  getAgentRunStatus,
  completeAgentRun,
  blockAgentRun,
  escalateRun,
} from '../runs.js'

beforeEach(() => createTestDb())
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces VALUES ('ws_1','test ws',datetime('now'))").run()
  db.prepare("INSERT INTO projects VALUES ('proj_1','ws_1','test proj',datetime('now'))").run()
}

async function seedTask() {
  seed()
  return createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'A task' })
}

describe('startAgentRun', () => {
  it('creates a running run and returns run_id', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer' })
    expect(run.status).toBe('running')
    expect(run.role).toBe('implementer')
    expect(run.run_id).toMatch(/^[0-9A-Z]{26}$/)
    expect(run.progress_pct).toBe(0)
  })

  it('captures git context (branch/commit may be null in test env)', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'tester' })
    // git_branch and git_commit are either strings or null — never undefined
    expect(run.git_branch === null || typeof run.git_branch === 'string').toBe(true)
    expect(run.git_commit === null || typeof run.git_commit === 'string').toBe(true)
  })
})

describe('heartbeatAgentRun', () => {
  it('updates current_step and progress_pct', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer' })
    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'parsing files', progress_pct: 42 })
    const updated = await getAgentRunStatus({ run_id: run.run_id })
    expect(updated.current_step).toBe('parsing files')
    expect(updated.progress_pct).toBe(42)
  })
})

describe('completeAgentRun', () => {
  it('sets status to completed with summary and artifacts', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer' })
    const completed = await completeAgentRun({
      run_id: run.run_id,
      output_summary: 'Done!',
      artifacts: { files_changed: ['src/foo.ts'], tests_passed: 10 },
    })
    expect(completed.status).toBe('completed')
    expect(completed.output_summary).toBe('Done!')
    expect(completed.artifacts?.files_changed).toEqual(['src/foo.ts'])
    expect(completed.artifacts?.tests_passed).toBe(10)
    expect(completed.completed_at).toBeTruthy()
  })
})

describe('blockAgentRun', () => {
  it('sets status to blocked with reason in note', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'reviewer' })
    const blocked = await blockAgentRun({ run_id: run.run_id, reason: 'waiting for upstream merge' })
    expect(blocked.status).toBe('blocked')
    expect(blocked.output_summary).toBe('waiting for upstream merge')
  })
})

describe('escalateRun', () => {
  it('creates a chief_of_staff task and sets run to escalated', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer' })
    await blockAgentRun({ run_id: run.run_id, reason: 'stuck' })
    const cosTask = await escalateRun({ run_id: run.run_id, escalation_reason: 'blocked for too long' })
    expect(cosTask.title).toContain('Escalation')
    expect(cosTask.assigned_to).toBe('chief_of_staff')
    const escalated = await getAgentRunStatus({ run_id: run.run_id })
    expect(escalated.status).toBe('escalated')
  })
})
