// packages/worker/src/tests/lifecycle.test.ts
// H-2 — spawnAgent lifecycle tests. Exercises:
//   - policy gate (only L1 may spawn)
//   - default stub adapter success path
//   - custom adapter registration + selection
//   - blocked result handling
//   - heartbeat callback → agent_runs.events
//   - thrown adapter errors → blocked run with the error message

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  setDb,
  closeDb,
  runMigrations,
  getDb,
  createTask,
  getAgentRunStatus,
  getTrace,
} from 'fulcrum-agent-core'
import { spawnAgent, registerAgentAdapter } from '../index.js'

let taskId: string

beforeEach(async () => {
  closeDb()
  const db = new Database(':memory:')
  runMigrations(db)
  setDb(db)

  // Seed workspace + project via raw SQL (same pattern as other packages).
  db.prepare(
    `INSERT INTO workspaces(workspace_id, name, created_at)
     VALUES ('ws_1', 'Worker Test Workspace', datetime('now'))`,
  ).run()
  db.prepare(
    `INSERT INTO projects(project_id, workspace_id, name, created_at)
     VALUES ('proj_1', 'ws_1', 'Worker Test Project', datetime('now'))`,
  ).run()

  const task = await createTask({
    workspace_id: 'ws_1',
    project_id: 'proj_1',
    title: 'H-2 test task',
  })
  taskId = task.task_id
})

afterEach(() => {
  closeDb()
})

describe('spawnAgent lifecycle (H-2)', () => {
  it('only L1 roles may spawn agents', async () => {
    await expect(
      spawnAgent({
        workspace_id: 'ws_1',
        project_id: 'proj_1',
        task_id: taskId,
        caller_role: 'software_engineer',
        target_role: 'software_engineer',
      }),
    ).rejects.toThrow(/can_invoke_teams/)
  })

  it('stub adapter completes the run and persists summary', async () => {
    const { run_id, result } = await spawnAgent({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      task_id: taskId,
      caller_role: 'chief_of_staff',
      target_role: 'software_engineer',
    })
    expect(result.status).toBe('completed')
    const status = await getAgentRunStatus({ run_id })
    // core uses 'finished' as the terminal "completed" state
    expect(status.status).toBe('finished')
    expect(status.output_summary).toContain('stub')
  })

  it('custom adapter registration works', async () => {
    registerAgentAdapter({
      name: 'test-custom',
      async spawn(ctx) {
        await ctx.heartbeat('custom_tick', 50)
        return { status: 'completed', summary: 'custom adapter result' }
      },
    })
    const { result, run_id } = await spawnAgent({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      task_id: taskId,
      caller_role: 'chief_of_staff',
      target_role: 'software_engineer',
      adapter: 'test-custom',
    })
    expect(result.summary).toBe('custom adapter result')
    const status = await getAgentRunStatus({ run_id })
    expect(status.output_summary).toBe('custom adapter result')
  })

  it('adapter returning blocked → run is blocked', async () => {
    registerAgentAdapter({
      name: 'test-blocked',
      async spawn() {
        return { status: 'blocked', error: 'simulated failure' }
      },
    })
    const { run_id } = await spawnAgent({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      task_id: taskId,
      caller_role: 'chief_of_staff',
      target_role: 'software_engineer',
      adapter: 'test-blocked',
    })
    const status = await getAgentRunStatus({ run_id })
    expect(status.status).toBe('blocked')
    expect(status.blocker).toBe('simulated failure')
  })

  it('heartbeat callbacks append heartbeat events to agent_runs.events', async () => {
    registerAgentAdapter({
      name: 'test-heartbeat',
      async spawn(ctx) {
        await ctx.heartbeat('step1', 25)
        await ctx.heartbeat('step2', 50)
        await ctx.heartbeat('step3', 75)
        return { status: 'completed', summary: 'ok' }
      },
    })
    const { run_id } = await spawnAgent({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      task_id: taskId,
      caller_role: 'chief_of_staff',
      target_role: 'software_engineer',
      adapter: 'test-heartbeat',
    })
    const rows = getDb()
      .prepare(`SELECT event_type FROM run_events WHERE run_id = ? AND event_type = 'heartbeat'`)
      .all(run_id) as { event_type: string }[]
    expect(rows.length).toBe(3)
  })

  it('adapter throwing → run is blocked with the error message', async () => {
    registerAgentAdapter({
      name: 'test-throw',
      async spawn() {
        throw new Error('boom')
      },
    })
    const { run_id, result } = await spawnAgent({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      task_id: taskId,
      caller_role: 'chief_of_staff',
      target_role: 'software_engineer',
      adapter: 'test-throw',
    })
    expect(result.status).toBe('blocked')
    expect(result.error).toBe('boom')
    const status = await getAgentRunStatus({ run_id })
    expect(status.status).toBe('blocked')
    expect(status.blocker).toBe('boom')
  })

  it('emits an agent.run span into trace_events (K-5)', async () => {
    const { run_id } = await spawnAgent({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      task_id: taskId,
      caller_role: 'chief_of_staff',
      target_role: 'software_engineer',
    })

    const row = getDb()
      .prepare(
        `SELECT span_id, trace_id FROM trace_events
         WHERE name = 'agent.run' AND run_id = ?
         ORDER BY started_at DESC LIMIT 1`,
      )
      .get(run_id) as { span_id: string; trace_id: string } | undefined
    expect(row).toBeDefined()

    const trace = await getTrace(row!.trace_id)
    expect(trace.length).toBe(1)
    const span = trace[0]!
    expect(span.name).toBe('agent.run')
    expect(span.run_id).toBe(run_id)
    expect(span.status).toBe('ok')
    expect(span.payload).toMatchObject({
      role: 'software_engineer',
      adapter: 'stub',
      status: 'completed',
    })
  })

  it('unknown adapter name throws not_found', async () => {
    await expect(
      spawnAgent({
        workspace_id: 'ws_1',
        project_id: 'proj_1',
        task_id: taskId,
        caller_role: 'chief_of_staff',
        target_role: 'software_engineer',
        adapter: 'does-not-exist',
      }),
    ).rejects.toThrow(/unknown agent adapter/)
  })
})
