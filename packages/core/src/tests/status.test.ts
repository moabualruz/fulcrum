import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { createTask } from '../tasks.js'
import { startAgentRun, blockAgentRun } from '../runs.js'
import { getWorkspaceStatus, buildCosContext, listAgentProfiles } from '../status.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces VALUES ('ws_1','test',datetime('now'))").run()
  db.prepare("INSERT INTO projects VALUES ('proj_1','ws_1','test',datetime('now'))").run()
}

describe('getWorkspaceStatus', () => {
  it('lists stale runs', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    const run = await startAgentRun({ task_id: t.task_id, workspace_id: 'ws_1', role: 'implementer' })
    const db = getDb()
    db.prepare("UPDATE agent_runs SET status = 'stale' WHERE run_id = ?").run(run.run_id)
    const status = await getWorkspaceStatus({ workspace_id: 'ws_1' })
    expect(status.stale_runs).toHaveLength(1)
    expect(status.stale_runs[0].run_id).toBe(run.run_id)
  })

  it('returns correct counts', async () => {
    seed()
    const t1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T1' })
    const t2 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T2' })
    await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T3' })
    const run1 = await startAgentRun({ task_id: t1.task_id, workspace_id: 'ws_1', role: 'implementer' })
    const run2 = await startAgentRun({ task_id: t2.task_id, workspace_id: 'ws_1', role: 'tester' })
    await blockAgentRun({ run_id: run2.run_id, reason: 'waiting' })

    const status = await getWorkspaceStatus({ workspace_id: 'ws_1' })
    expect(status.running_runs).toHaveLength(1)
    expect(status.blocked_runs).toHaveLength(1)
    expect(status.wip_count).toBe(1)
    // Tasks T1, T2, T3 all remain 'queued' — startAgentRun does NOT change task status
    expect(status.queued_tasks).toBe(3)
  })
})

describe('getWorkspaceStatus — completed count', () => {
  it('increments completed_tasks_today when a run is completed today', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    const run = await startAgentRun({ task_id: t.task_id, workspace_id: 'ws_1', role: 'implementer' })
    const { completeAgentRun } = await import('../runs.js')
    await completeAgentRun({ run_id: run.run_id, output_summary: 'done' })
    const status = await getWorkspaceStatus({ workspace_id: 'ws_1' })
    expect(status.completed_tasks_today).toBe(1)
  })
})

describe('buildCosContext', () => {
  it('returns a non-empty markdown string', async () => {
    seed()
    const context = await buildCosContext({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(typeof context).toBe('string')
    expect(context.length).toBeGreaterThan(0)
  })

  it('respects max_tokens budget (approximate)', async () => {
    seed()
    const context = await buildCosContext({ workspace_id: 'ws_1', project_id: 'proj_1', max_tokens: 100 })
    // ~4 chars per token — should be under 400 chars + some slack
    expect(context.length).toBeLessThan(600)
  })

  it('includes memories in context output', async () => {
    seed()
    const { writeMemory } = await import('../memory.js')
    await writeMemory({ workspace_id: 'ws_1', project_id: 'proj_1', content: 'Use SQLite for local-first storage' })
    const context = await buildCosContext({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(context).toContain('SQLite')
  })

  it('includes blocked runs for the project in context', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Blocked task' })
    const run = await startAgentRun({ task_id: t.task_id, workspace_id: 'ws_1', role: 'reviewer' })
    await blockAgentRun({ run_id: run.run_id, reason: 'waiting for upstream' })
    const context = await buildCosContext({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(context).toContain('Blocked')
    expect(context).toContain('waiting for upstream')
  })

  it('only shows runs belonging to the given project', async () => {
    const db = getDb()
    db.prepare("INSERT INTO workspaces VALUES ('ws_1','test',datetime('now'))").run()
    db.prepare("INSERT INTO projects VALUES ('proj_1','ws_1','p1',datetime('now'))").run()
    db.prepare("INSERT INTO projects VALUES ('proj_2','ws_1','p2',datetime('now'))").run()

    const t1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Task in P1' })
    const t2 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_2', title: 'Task in P2' })
    await startAgentRun({ task_id: t1.task_id, workspace_id: 'ws_1', role: 'implementer' })
    await startAgentRun({ task_id: t2.task_id, workspace_id: 'ws_1', role: 'tester' })

    const context = await buildCosContext({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(context).toContain('implementer')
    expect(context).not.toContain('tester')
  })
})

describe('getWorkspaceStatus — cross-workspace isolation', () => {
  it('does not return runs from a different workspace', async () => {
    const db = getDb()
    db.prepare("INSERT INTO workspaces VALUES ('ws_1','test',datetime('now'))").run()
    db.prepare("INSERT INTO workspaces VALUES ('ws_2','other',datetime('now'))").run()
    db.prepare("INSERT INTO projects VALUES ('proj_1','ws_1','p1',datetime('now'))").run()
    db.prepare("INSERT INTO projects VALUES ('proj_2','ws_2','p2',datetime('now'))").run()
    const t1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T1' })
    await startAgentRun({ task_id: t1.task_id, workspace_id: 'ws_1', role: 'tester' })
    const status = await getWorkspaceStatus({ workspace_id: 'ws_2' })
    expect(status.running_runs).toHaveLength(0)
    expect(status.wip_count).toBe(0)
  })
})

describe('listAgentProfiles', () => {
  it('returns all 6 roles', async () => {
    const profiles = await listAgentProfiles()
    expect(profiles).toHaveLength(6)
    const roles = profiles.map(p => p.role)
    expect(roles).toContain('chief_of_staff')
    expect(roles).toContain('implementer')
    expect(roles).toContain('tester')
  })

  it('only chief_of_staff can create teams', async () => {
    const profiles = await listAgentProfiles()
    const cos = profiles.find(p => p.role === 'chief_of_staff')!
    const impl = profiles.find(p => p.role === 'implementer')!
    expect(cos.can_create_teams).toBe(true)
    expect(impl.can_create_teams).toBe(false)
  })
})
