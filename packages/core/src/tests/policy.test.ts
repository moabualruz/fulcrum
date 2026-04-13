import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { createTask } from '../tasks.js'
import { startAgentRun } from '../runs.js'
import { checkPolicy } from '../policy.js'
import type { PolicyConfig } from '../types.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces VALUES ('ws_1','test',datetime('now'))").run()
  db.prepare("INSERT INTO projects VALUES ('proj_1','ws_1','test',datetime('now'))").run()
}

const defaultPolicy: PolicyConfig = {
  wip_limit: 2,
  wip_limit_per_role: { implementer: 1 },
  heartbeat_timeout_minutes: 10,
  escalation_timeout_minutes: 30,
}

describe('checkPolicy — WIP limits', () => {
  it('allows a run when under global WIP limit', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    const result = await checkPolicy({
      workspace_id: 'ws_1',
      task_id: t.task_id,
      role: 'implementer',
      policy: defaultPolicy,
    })
    expect(result.allowed).toBe(true)
  })

  it('blocks when global WIP limit is reached', async () => {
    seed()
    const t1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T1' })
    const t2 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T2' })
    const t3 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T3' })
    await startAgentRun({ task_id: t1.task_id, workspace_id: 'ws_1', role: 'tester' })
    await startAgentRun({ task_id: t2.task_id, workspace_id: 'ws_1', role: 'reviewer' })
    const result = await checkPolicy({
      workspace_id: 'ws_1',
      task_id: t3.task_id,
      role: 'tester',
      policy: defaultPolicy,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('wip_limit_exceeded')
    expect(result.current_wip).toBe(2)
    expect(result.limit).toBe(2)
  })

  it('blocks when per-role WIP limit is reached', async () => {
    seed()
    const t1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T1' })
    const t2 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T2' })
    await startAgentRun({ task_id: t1.task_id, workspace_id: 'ws_1', role: 'implementer' })
    const result = await checkPolicy({
      workspace_id: 'ws_1',
      task_id: t2.task_id,
      role: 'implementer',
      policy: defaultPolicy,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('wip_limit_exceeded')
    expect(result.current_wip).toBe(1)  // one implementer running
    expect(result.limit).toBe(1)         // per-role limit is 1
  })
})

describe('checkPolicy — task dependencies', () => {
  it('blocks when a dependency is not completed', async () => {
    seed()
    const dep = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Dep' })
    const child = await createTask({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Child',
      depends_on: [dep.task_id],
    })
    const result = await checkPolicy({
      workspace_id: 'ws_1',
      task_id: child.task_id,
      role: 'implementer',
      policy: defaultPolicy,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('dependencies_incomplete')
    expect(result.blocking_tasks).toContain(dep.task_id)
  })

  it('allows when all dependencies are completed', async () => {
    seed()
    const dep = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Dep' })
    const { updateTask } = await import('../tasks.js')
    await updateTask({ task_id: dep.task_id, status: 'completed' })
    const child = await createTask({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Child',
      depends_on: [dep.task_id],
    })
    const result = await checkPolicy({
      workspace_id: 'ws_1',
      task_id: child.task_id,
      role: 'implementer',
      policy: defaultPolicy,
    })
    expect(result.allowed).toBe(true)
  })
})
