import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { createTask, updateTask } from '../tasks.js'
import { startAgentRun, heartbeatAgentRun, completeAgentRun, blockAgentRun, getAgentRunStatus } from '../runs.js'
import { writeMemory, recallMemory } from '../memory.js'
import { listAgentProfiles, getWorkspaceStatus } from '../status.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces (workspace_id, name, created_at, status, config_path) VALUES ('ws_1','Acme Corp',datetime('now'),'active',NULL)").run()
  db.prepare(
    "INSERT INTO projects (project_id, workspace_id, name, created_at, project_type, root_path, default_branch, parent_project_id, write_mode, status, type, git_url) " +
    "VALUES ('proj_1','ws_1','Backend API',datetime('now'),NULL,NULL,NULL,NULL,'sequential','active','git',NULL)"
  ).run()
}

describe('full lifecycle integration', () => {
  it('task creation emits task_created event with display_id', async () => {
    seed()
    const task = await createTask({
      workspace_id: 'ws_1', project_id: 'proj_1',
      title: 'Implement auth endpoint',
      description: 'POST /auth/login with JWT response',
    })
    expect(task.display_id).toBe('TASK-1')
    expect(task.status_category).toBe('backlog')
    expect(task.priority).toBe('medium')

    const db = getDb()
    const evt = db.prepare("SELECT * FROM events WHERE object_id = ? AND evt_type = 'task_created'").get(task.task_id) as Record<string, unknown>
    expect(evt).toBeTruthy()
    expect(JSON.parse(evt.payload as string)).toMatchObject({ display_id: 'TASK-1' })
  })

  it('agent run lifecycle: created → running → heartbeat → finished', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Auth endpoint' })
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer', agent_id: 'agent-001' })

    expect(run.display_id).toBe('RUN-1')
    expect(run.agent_id).toBe('agent-001')
    expect(run.status_category).toBe('active')

    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'Writing auth handler', progress_pct: 30, current_path: 'src/auth/handler.ts' })
    const mid = await getAgentRunStatus({ run_id: run.run_id })
    expect(mid.current_step).toBe('Writing auth handler')
    expect(mid.heartbeat_at).toBeTruthy()
    expect(mid.current_path).toBe('src/auth/handler.ts')

    const completed = await completeAgentRun({
      run_id: run.run_id,
      output_summary: 'Auth endpoint implemented with JWT',
      artifacts: { files_changed: ['src/auth/handler.ts'], tests_passed: 12 },
    })
    expect(completed.status).toBe('finished')
    expect(completed.status_category).toBe('done')
    expect(completed.finished_at).toBeTruthy()

    const db = getDb()
    const evts = db.prepare("SELECT evt_type FROM events WHERE object_id = ? ORDER BY rowid ASC").all(run.run_id) as { evt_type: string }[]
    const types = evts.map(e => e.evt_type)
    expect(types).toContain('agent_run_created')
    expect(types).toContain('agent_run_started')
    expect(types).toContain('agent_run_finished')
  })

  it('blocking a run sets blocker, status_category=blocked, emits event', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Review PR' })
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'code_reviewer', agent_id: 'agent-002' })
    const blocked = await blockAgentRun({ run_id: run.run_id, reason: 'CI checks still running' })

    expect(blocked.status).toBe('blocked')
    expect(blocked.blocker).toBe('CI checks still running')
    expect(blocked.status_category).toBe('blocked')

    const db = getDb()
    const evt = db.prepare("SELECT * FROM events WHERE evt_type = 'agent_run_blocked' AND object_id = ?").get(run.run_id)
    expect(evt).toBeTruthy()
  })

  it('task status changes emit task_status_changed event with from/to', async () => {
    seed()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'A task' })
    await updateTask({ task_id: task.task_id, status: 'running' })
    await updateTask({ task_id: task.task_id, status: 'completed' })

    const db = getDb()
    const evts = db.prepare("SELECT payload FROM events WHERE evt_type = 'task_status_changed' AND object_id = ? ORDER BY rowid ASC").all(task.task_id) as { payload: string }[]
    expect(evts).toHaveLength(2)
    const first = JSON.parse(evts[0].payload) as Record<string, string>
    const second = JSON.parse(evts[1].payload) as Record<string, string>
    expect(first.from_status).toBe('queued')
    expect(first.to_status).toBe('running')
    expect(second.from_status).toBe('running')
    expect(second.to_status).toBe('completed')
    expect(second.to_category).toBe('done')
  })

  it('task relations can be inserted and queried', async () => {
    seed()
    const t1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Setup DB' })
    const t2 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Implement API' })
    const db = getDb()
    db.prepare(`
      INSERT INTO task_relations (task_id, target_task_id, relation_type)
      VALUES (?, ?, 'blocks')
    `).run(t1.task_id, t2.task_id)
    const relation = db.prepare('SELECT * FROM task_relations WHERE task_id = ?').get(t1.task_id) as Record<string, unknown>
    expect(relation.target_task_id).toBe(t2.task_id)
    expect(relation.relation_type).toBe('blocks')
  })

  it('display_id sequences are project-scoped and monotonic', async () => {
    seed()
    const db = getDb()
    db.prepare(
      "INSERT INTO projects (project_id, workspace_id, name, created_at, project_type, root_path, default_branch, parent_project_id, write_mode, status, type, git_url) " +
      "VALUES ('proj_2','ws_1','Frontend',datetime('now'),NULL,NULL,NULL,NULL,'sequential','active','git',NULL)"
    ).run()

    const t1 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P1 T1' })
    const t2 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P1 T2' })
    const t3 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_2', title: 'P2 T1' })
    const t4 = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P1 T3' })
    expect(t1.display_id).toBe('TASK-1')
    expect(t2.display_id).toBe('TASK-2')
    expect(t3.display_id).toBe('TASK-1')
    expect(t4.display_id).toBe('TASK-3')
  })

  it('memory writeMemory stores scope, kind, title, summary; recallMemory returns them', async () => {
    seed()
    const m = await writeMemory({
      workspace_id: 'ws_1', project_id: 'proj_1',
      content: 'JWT tokens expire after 24 hours',
      scope: 'project', kind: 'decision',
      title: 'JWT expiry decision', summary: 'We chose 24h for JWT token expiry',
      tags: ['auth', 'jwt'],
    })
    expect(m.scope).toBe('project')
    expect(m.kind).toBe('decision')
    expect(m.title).toBe('JWT expiry decision')
    expect(m.summary).toBe('We chose 24h for JWT token expiry')

    const results = await recallMemory({ workspace_id: 'ws_1', project_id: 'proj_1', query: 'JWT' })
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].title).toBe('JWT expiry decision')
  })

  it('listAgentProfiles returns 24 roles; workspace status reflects run counts', async () => {
    seed()
    const profiles = await listAgentProfiles()
    expect(profiles).toHaveLength(24)

    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Status test task' })
    await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'qa_engineer', agent_id: 'a1' })
    const status = await getWorkspaceStatus({ workspace_id: 'ws_1' })
    expect(status.running_runs.length).toBeGreaterThanOrEqual(1)
    expect(status.wip_count).toBeGreaterThanOrEqual(1)
  })
})
