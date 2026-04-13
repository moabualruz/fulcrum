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

beforeEach(() => { createTestDb() })
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

  it('increments version on each heartbeat', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer' })
    expect(run.version).toBe(0)
    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'step 1', progress_pct: 10 })
    const v1 = await getAgentRunStatus({ run_id: run.run_id })
    expect(v1.version).toBe(1)
    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'step 2', progress_pct: 20 })
    const v2 = await getAgentRunStatus({ run_id: run.run_id })
    expect(v2.version).toBe(2)
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

  it('increments version on completion', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer' })
    expect(run.version).toBe(0)
    const completed = await completeAgentRun({ run_id: run.run_id, output_summary: 'done' })
    expect(completed.version).toBe(1)
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
    expect(cosTask.description).toContain('blocked for too long')
    const escalated = await getAgentRunStatus({ run_id: run.run_id })
    expect(escalated.status).toBe('escalated')
  })

  it('creates CoS task in the same project as the original task', async () => {
    const task = await seedTask() // task is in proj_1
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer' })
    const cosTask = await escalateRun({ run_id: run.run_id, escalation_reason: 'needs attention' })
    expect(cosTask.project_id).toBe(task.project_id)
    expect(cosTask.workspace_id).toBe(task.workspace_id)
  })
})

describe('not_found errors', () => {
  it('startAgentRun throws not_found for unknown task_id', async () => {
    seed()
    await expect(
      startAgentRun({ task_id: 'NONEXISTENT', workspace_id: 'ws_1', role: 'implementer' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('startAgentRun throws invalid_input when workspace_id does not match the task', async () => {
    const db = getDb()
    seed()
    db.prepare("INSERT INTO workspaces VALUES ('ws_2','other ws',datetime('now'))").run()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    await expect(
      startAgentRun({ task_id: task.task_id, workspace_id: 'ws_2', role: 'implementer' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('heartbeatAgentRun throws not_found for unknown run_id', async () => {
    await seedTask()
    await expect(
      heartbeatAgentRun({ run_id: 'NONEXISTENT', current_step: 'step', progress_pct: 0 })
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('getAgentRunStatus throws not_found for unknown run_id', async () => {
    await seedTask()
    await expect(
      getAgentRunStatus({ run_id: 'NONEXISTENT' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('completeAgentRun throws not_found for unknown run_id', async () => {
    await seedTask()
    await expect(
      completeAgentRun({ run_id: 'NONEXISTENT', output_summary: 'done' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('blockAgentRun throws not_found for unknown run_id', async () => {
    await seedTask()
    await expect(
      blockAgentRun({ run_id: 'NONEXISTENT', reason: 'stuck' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('escalateRun throws not_found for unknown run_id', async () => {
    await seedTask()
    await expect(
      escalateRun({ run_id: 'NONEXISTENT', escalation_reason: 'blocked too long' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('input validation', () => {
  it('heartbeatAgentRun throws invalid_input for progress_pct > 100', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer' })
    await expect(
      heartbeatAgentRun({ run_id: run.run_id, current_step: 'step', progress_pct: 101 })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('heartbeatAgentRun throws invalid_input for progress_pct < 0', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer' })
    await expect(
      heartbeatAgentRun({ run_id: run.run_id, current_step: 'step', progress_pct: -1 })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('heartbeatAgentRun accepts boundary values 0 and 100', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer' })
    await expect(
      heartbeatAgentRun({ run_id: run.run_id, current_step: 'start', progress_pct: 0 })
    ).resolves.toBeUndefined()
    await expect(
      heartbeatAgentRun({ run_id: run.run_id, current_step: 'done', progress_pct: 100 })
    ).resolves.toBeUndefined()
  })

  it('blockAgentRun throws invalid_input for empty reason', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'reviewer' })
    await expect(
      blockAgentRun({ run_id: run.run_id, reason: '' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      blockAgentRun({ run_id: run.run_id, reason: '   ' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('escalateRun throws invalid_input for empty escalation_reason', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'implementer' })
    await expect(
      escalateRun({ run_id: run.run_id, escalation_reason: '' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      escalateRun({ run_id: run.run_id, escalation_reason: '   ' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })
})
