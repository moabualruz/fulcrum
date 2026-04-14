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
  db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_1','test')").run()
  db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_1','ws_1','test')").run()
}

describe('getWorkspaceStatus', () => {
  it('lists stale runs', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    const run = await startAgentRun({ task_id: t.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
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
    const run1 = await startAgentRun({ task_id: t1.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    const run2 = await startAgentRun({ task_id: t2.task_id, workspace_id: 'ws_1', role: 'qa_engineer' })
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
    const run = await startAgentRun({ task_id: t.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
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
    const run = await startAgentRun({ task_id: t.task_id, workspace_id: 'ws_1', role: 'code_reviewer' })
    await blockAgentRun({ run_id: run.run_id, reason: 'waiting for upstream' })
    const context = await buildCosContext({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(context).toContain('Blocked')
    expect(context).toContain('waiting for upstream')
  })

  it('only shows runs belonging to the given project', async () => {
    const db = getDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_1','test')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_1','ws_1','p1')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_2','ws_1','p2')").run()

    const t1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Task in P1' })
    const t2 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_2', title: 'Task in P2' })
    await startAgentRun({ task_id: t1.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    await startAgentRun({ task_id: t2.task_id, workspace_id: 'ws_1', role: 'qa_engineer' })

    const context = await buildCosContext({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(context).toContain('software_engineer')
    expect(context).not.toContain('qa_engineer')
  })
})

describe('getWorkspaceStatus — cross-workspace isolation', () => {
  it('does not return runs from a different workspace', async () => {
    const db = getDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_1','test')").run()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_2','other')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_1','ws_1','p1')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_2','ws_2','p2')").run()
    const t1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T1' })
    await startAgentRun({ task_id: t1.task_id, workspace_id: 'ws_1', role: 'qa_engineer' })
    const status = await getWorkspaceStatus({ workspace_id: 'ws_2' })
    expect(status.running_runs).toHaveLength(0)
    expect(status.wip_count).toBe(0)
  })
})

describe('listAgentProfiles', () => {
  it('returns all 24 roles', async () => {
    const profiles = await listAgentProfiles()
    expect(profiles).toHaveLength(24)
    const roles = profiles.map(p => p.role)
    expect(roles).toContain('chief_of_staff')
    expect(roles).toContain('software_engineer')
    expect(roles).toContain('qa_engineer')
  })

  it('only chief_of_staff can create teams', async () => {
    const profiles = await listAgentProfiles()
    const cos = profiles.find(p => p.role === 'chief_of_staff')!
    const impl = profiles.find(p => p.role === 'software_engineer')!
    expect(cos.can_create_teams).toBe(true)
    expect(impl.can_create_teams).toBe(false)
  })
})

describe('listAgentProfiles — all 24 roles', () => {
  it('returns exactly 24 agent profiles', async () => {
    const profiles = await listAgentProfiles()
    expect(profiles).toHaveLength(24)
  })

  it('includes all 24 expected roles', async () => {
    const profiles = await listAgentProfiles()
    const roles = profiles.map(p => p.role)
    const expected = [
      'chief_of_staff', 'context_gatherer', 'prd_planner', 'implementation_planner',
      'issue_decomposer', 'architecture_reviewer', 'research_worker',
      'software_engineer', 'refactor_worker', 'browser_worker',
      'data_engineer', 'ml_engineer', 'devops_engineer',
      'qa_engineer', 'code_reviewer', 'security_reviewer',
      'integration_worker', 'documentation_writer', 'memory_curator',
      'tech_lead', 'product_manager', 'analyst', 'orchestrator', 'custom',
    ]
    for (const role of expected) {
      expect(roles, `missing role: ${role}`).toContain(role)
    }
  })

  it('chief_of_staff can create teams and dispatch agents', async () => {
    const profiles = await listAgentProfiles()
    const cos = profiles.find(p => p.role === 'chief_of_staff')
    expect(cos?.can_create_teams).toBe(true)
    expect(cos?.can_dispatch_agents).toBe(true)
  })

  it('all non-CoS roles have can_create_teams false', async () => {
    const profiles = await listAgentProfiles()
    for (const p of profiles) {
      if (p.role !== 'chief_of_staff') {
        expect(p.can_create_teams, `${p.role} should not create teams`).toBe(false)
      }
    }
  })
})

describe('listAgentProfiles reads role MDs (G-11)', () => {
  it('chief_of_staff description matches Purpose from chief_of_staff.md', async () => {
    const profiles = await listAgentProfiles()
    const cos = profiles.find(p => p.role === 'chief_of_staff')
    expect(cos).toBeDefined()
    // Purpose paragraph mentions orchestration/L1/coordinate/chief
    expect(cos!.description.toLowerCase()).toMatch(/orchestrat|coordinat|l1|chief/)
  })

  it('integration_worker description mentions merge', async () => {
    const profiles = await listAgentProfiles()
    const iw = profiles.find(p => p.role === 'integration_worker')
    expect(iw).toBeDefined()
    expect(iw!.description.toLowerCase()).toMatch(/merg|integrat/)
  })

  it('software_engineer description is non-empty', async () => {
    const profiles = await listAgentProfiles()
    const se = profiles.find(p => p.role === 'software_engineer')
    expect(se?.description.length).toBeGreaterThan(20)
  })

  it('roles without an MD file still have a description (fallback)', async () => {
    const profiles = await listAgentProfiles()
    for (const p of profiles) {
      expect(p.description).toBeTruthy()
      expect(p.description.length).toBeGreaterThan(5)
    }
  })
})
