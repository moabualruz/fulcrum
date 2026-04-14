import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { createTask } from '../tasks.js'
import { writeMemory } from '../memory.js'
import { updateAgentDefinition } from '../agent-definitions.js'
import {
  startAgentRun,
  heartbeatAgentRun,
  getAgentRunStatus,
  completeAgentRun,
  blockAgentRun,
  escalateRun,
  buildSpawnableRun,
} from '../runs.js'

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

describe('startAgentRun', () => {
  it('creates a running run and returns run_id', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    expect(run.status).toBe('running')
    expect(run.role).toBe('software_engineer')
    expect(run.run_id).toMatch(/^run_[0-9A-Z]{26}$|^[0-9A-Z]{26}$/)
    expect(run.progress_pct).toBe(0)
  })

  it('captures git context (branch/commit may be null in test env)', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'qa_engineer' })
    // git_branch and git_commit are either strings or null — never undefined
    expect(run.git_branch === null || typeof run.git_branch === 'string').toBe(true)
    expect(run.git_commit === null || typeof run.git_commit === 'string').toBe(true)
  })
})

describe('heartbeatAgentRun', () => {
  it('updates current_step and progress_pct', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'parsing files', progress_pct: 42 })
    const updated = await getAgentRunStatus({ run_id: run.run_id })
    expect(updated.current_step).toBe('parsing files')
    expect(updated.progress_pct).toBe(42)
  })

  it('increments version on each heartbeat', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
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
  it('sets status to finished with summary and artifacts', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    const completed = await completeAgentRun({
      run_id: run.run_id,
      output_summary: 'Done!',
      artifacts: { files_changed: ['src/foo.ts'], tests_passed: 10 },
    })
    expect(completed.status).toBe('finished')
    expect(completed.output_summary).toBe('Done!')
    expect(completed.artifacts?.files_changed).toEqual(['src/foo.ts'])
    expect(completed.artifacts?.tests_passed).toBe(10)
    expect(completed.finished_at).toBeTruthy()
  })

  it('increments version on completion', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    expect(run.version).toBe(0)
    const completed = await completeAgentRun({ run_id: run.run_id, output_summary: 'done' })
    expect(completed.version).toBe(1)
  })
})

describe('blockAgentRun', () => {
  it('sets status to blocked with reason in note', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'code_reviewer' })
    const blocked = await blockAgentRun({ run_id: run.run_id, reason: 'waiting for upstream merge' })
    expect(blocked.status).toBe('blocked')
    expect(blocked.blocker).toBe('waiting for upstream merge')
  })
})

describe('escalateRun', () => {
  it('creates a chief_of_staff task and sets run to escalated', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    await blockAgentRun({ run_id: run.run_id, reason: 'stuck' })
    const cosTask = await escalateRun({ run_id: run.run_id, escalation_reason: 'blocked for too long' })
    expect(cosTask.title).toContain('Escalation')
    expect(cosTask.assigned_to).toBe('chief_of_staff')
    expect(cosTask.description).toContain('blocked for too long')
    const escalated = await getAgentRunStatus({ run_id: run.run_id })
    expect(escalated.status).toBe('aborted')
  })

  it('creates CoS task in the same project as the original task', async () => {
    const task = await seedTask() // task is in proj_1
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    const cosTask = await escalateRun({ run_id: run.run_id, escalation_reason: 'needs attention' })
    expect(cosTask.project_id).toBe(task.project_id)
    expect(cosTask.workspace_id).toBe(task.workspace_id)
  })
})

describe('not_found errors', () => {
  it('startAgentRun throws not_found for unknown task_id', async () => {
    seed()
    await expect(
      startAgentRun({ task_id: 'NONEXISTENT', workspace_id: 'ws_1', role: 'software_engineer' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('startAgentRun throws invalid_input when workspace_id does not match the task', async () => {
    const db = getDb()
    seed()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_2','other ws')").run()
    const task = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    await expect(
      startAgentRun({ task_id: task.task_id, workspace_id: 'ws_2', role: 'software_engineer' })
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
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    await expect(
      heartbeatAgentRun({ run_id: run.run_id, current_step: 'step', progress_pct: 101 })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('heartbeatAgentRun throws invalid_input for progress_pct < 0', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    await expect(
      heartbeatAgentRun({ run_id: run.run_id, current_step: 'step', progress_pct: -1 })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('heartbeatAgentRun accepts boundary values 0 and 100', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    await expect(
      heartbeatAgentRun({ run_id: run.run_id, current_step: 'start', progress_pct: 0 })
    ).resolves.toBeUndefined()
    await expect(
      heartbeatAgentRun({ run_id: run.run_id, current_step: 'done', progress_pct: 100 })
    ).resolves.toBeUndefined()
  })

  it('blockAgentRun throws invalid_input for empty reason', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'code_reviewer' })
    await expect(
      blockAgentRun({ run_id: run.run_id, reason: '' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      blockAgentRun({ run_id: run.run_id, reason: '   ' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('escalateRun throws invalid_input for empty escalation_reason', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    await expect(
      escalateRun({ run_id: run.run_id, escalation_reason: '' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      escalateRun({ run_id: run.run_id, escalation_reason: '   ' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })
})

describe('startAgentRun — display_id, agent_id, status_category, events', () => {
  it('generates a RUN- display_id', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer', agent_id: 'agent-abc' })
    expect(run.display_id).toMatch(/^RUN-\d+$/)
  })

  it('stores agent_id from input', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer', agent_id: 'agent-xyz' })
    expect(run.agent_id).toBe('agent-xyz')
  })

  it('sets status_category to active', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer', agent_id: 'a1' })
    expect(run.status_category).toBe('active')
  })

  it('emits agent_run_created and agent_run_started events', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer', agent_id: 'a1' })
    const db = getDb()
    const created = db.prepare("SELECT * FROM events WHERE evt_type = 'agent_run_created' AND object_id = ?").get(run.run_id)
    const started = db.prepare("SELECT * FROM events WHERE evt_type = 'agent_run_started' AND object_id = ?").get(run.run_id)
    expect(created).toBeTruthy()
    expect(started).toBeTruthy()
  })
})

describe('heartbeatAgentRun — heartbeat_at', () => {
  it('updates heartbeat_at on each call', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer', agent_id: 'a1' })
    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'step', progress_pct: 10 })
    const updated = await getAgentRunStatus({ run_id: run.run_id })
    expect(updated.heartbeat_at).toBeTruthy()
  })
})

describe('completeAgentRun — finished_at, status_category, event', () => {
  it('sets finished_at on completion', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer', agent_id: 'a1' })
    const completed = await completeAgentRun({ run_id: run.run_id, output_summary: 'done' })
    expect(completed.finished_at).toBeTruthy()
  })

  it('sets status_category to done on completion', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer', agent_id: 'a1' })
    const completed = await completeAgentRun({ run_id: run.run_id, output_summary: 'done' })
    expect(completed.status_category).toBe('done')
  })

  it('emits agent_run_finished event', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer', agent_id: 'a1' })
    const completed = await completeAgentRun({ run_id: run.run_id, output_summary: 'done' })
    const db = getDb()
    const evt = db.prepare("SELECT * FROM events WHERE evt_type = 'agent_run_finished' AND object_id = ?").get(completed.run_id)
    expect(evt).toBeTruthy()
  })
})

describe('blockAgentRun — blocker field, status_category, event', () => {
  it('sets blocker field with the reason', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'code_reviewer', agent_id: 'a1' })
    const blocked = await blockAgentRun({ run_id: run.run_id, reason: 'waiting for review' })
    expect(blocked.blocker).toBe('waiting for review')
  })

  it('sets status_category to blocked', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'code_reviewer', agent_id: 'a1' })
    const blocked = await blockAgentRun({ run_id: run.run_id, reason: 'reason' })
    expect(blocked.status_category).toBe('blocked')
  })

  it('emits agent_run_blocked event', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'code_reviewer', agent_id: 'a1' })
    const blocked = await blockAgentRun({ run_id: run.run_id, reason: 'reason' })
    const db = getDb()
    const evt = db.prepare("SELECT * FROM events WHERE evt_type = 'agent_run_blocked' AND object_id = ?").get(blocked.run_id)
    expect(evt).toBeTruthy()
  })
})

describe('startAgentRun — pi_profile', () => {
  it('stores and retrieves pi_profile when provided', async () => {
    const task = await seedTask()
    const run = await startAgentRun({
      task_id: task.task_id,
      workspace_id: 'ws_1',
      role: 'software_engineer',
      pi_profile: 'claude-cli/claude-opus-4-5',
    })
    expect(run.pi_profile).toBe('claude-cli/claude-opus-4-5')
  })

  it('stores null pi_profile when not provided', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    expect(run.pi_profile).toBeNull()
  })

  it('retrieves pi_profile via getAgentRunStatus', async () => {
    const task = await seedTask()
    const run = await startAgentRun({
      task_id: task.task_id,
      workspace_id: 'ws_1',
      role: 'software_engineer',
      pi_profile: 'gemini-cli/gemini-pro',
    })
    const fetched = await getAgentRunStatus({ run_id: run.run_id })
    expect(fetched.pi_profile).toBe('gemini-cli/gemini-pro')
  })
})

describe('buildSpawnableRun', () => {
  it('returns correct SpawnableRun shape', async () => {
    const task = await seedTask()
    const run = await startAgentRun({
      task_id: task.task_id,
      workspace_id: 'ws_1',
      role: 'software_engineer',
      pi_profile: 'claude-cli/claude-opus-4-5',
    })
    const packet = { goal: 'implement feature X', task_type: 'implement' }
    const spawnable = buildSpawnableRun(run, packet)
    expect(spawnable.run_id).toBe(run.run_id)
    expect(spawnable.workspace_id).toBe(run.workspace_id)
    expect(spawnable.role).toBe('software_engineer')
    expect(spawnable.pi_profile).toBe('claude-cli/claude-opus-4-5')
    expect(spawnable.task_packet).toEqual(packet)
  })

  it('includes optional task_packet fields', async () => {
    const task = await seedTask()
    const run = await startAgentRun({
      task_id: task.task_id,
      workspace_id: 'ws_1',
      role: 'code_reviewer',
      pi_profile: 'gemini-cli/gemini-pro',
    })
    const packet = {
      goal: 'review PR #42',
      task_type: 'review',
      constraints: ['no style nits', 'focus on correctness'],
      done_criteria: 'all blocking issues addressed',
      inputs: { pr_url: 'https://github.com/foo/bar/pull/42' },
    }
    const spawnable = buildSpawnableRun(run, packet)
    expect(spawnable.task_packet.constraints).toEqual(['no style nits', 'focus on correctness'])
    expect(spawnable.task_packet.done_criteria).toBe('all blocking issues addressed')
    expect(spawnable.task_packet.inputs?.pr_url).toBe('https://github.com/foo/bar/pull/42')
  })

  it('throws invalid_input if run has no pi_profile', async () => {
    const task = await seedTask()
    const run = await startAgentRun({
      task_id: task.task_id,
      workspace_id: 'ws_1',
      role: 'software_engineer',
      // no pi_profile
    })
    expect(() => buildSpawnableRun(run, { goal: 'do work', task_type: 'implement' }))
      .toThrow(expect.objectContaining({ code: 'invalid_input' }))
  })

  it('resolves model, tools_allow, tools_deny, executor_uri from agent_definitions', async () => {
    const task = await seedTask()
    // software_engineer is seeded by migration_032b — update it with test-specific values
    updateAgentDefinition({
      role: 'software_engineer',
      model: 'claude-opus-4-6',
      tools_allow: ['read_file', 'write_file'],
      tools_deny: ['invoke_team'],
      executor_uri: 'https://executor.example.com/run',
    })
    const run = await startAgentRun({
      task_id: task.task_id,
      workspace_id: 'ws_1',
      role: 'software_engineer',
      pi_profile: 'claude-cli/claude-opus-4-6',
    })
    const spawnable = buildSpawnableRun(run, { goal: 'implement X', task_type: 'implement' })
    expect(spawnable.model).toBe('claude-opus-4-6')
    expect(spawnable.tools_allow).toEqual(['read_file', 'write_file'])
    expect(spawnable.tools_deny).toEqual(['invoke_team'])
    expect(spawnable.executor_uri).toBe('https://executor.example.com/run')
  })

  it('returns null definition fields when no agent_definition registered for the role', async () => {
    const task = await seedTask()
    const run = await startAgentRun({
      task_id: task.task_id,
      workspace_id: 'ws_1',
      role: 'data_engineer',
      pi_profile: 'claude-cli/claude-sonnet-4-6',
    })
    const spawnable = buildSpawnableRun(run, { goal: 'pipeline work', task_type: 'implement' })
    expect(spawnable.model).toBeNull()
    expect(spawnable.tools_allow).toBeNull()
    expect(spawnable.tools_deny).toBeNull()
    expect(spawnable.executor_uri).toBeNull()
  })
})

describe('agent run event journal (G-7)', () => {
  type RunEvent = { ts: string; event_type: string; payload: Record<string, unknown> }

  function readEvents(run_id: string): RunEvent[] {
    const row = getDb().prepare('SELECT events FROM agent_runs WHERE run_id = ?').get(run_id) as { events: string | null } | undefined
    if (!row || !row.events) return []
    return JSON.parse(row.events) as RunEvent[]
  }

  it('startAgentRun seeds events with a "started" entry', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    const events = readEvents(run.run_id)
    expect(events.length).toBe(1)
    expect(events[0].event_type).toBe('started')
    expect(events[0].payload.agent_role).toBe('software_engineer')
    expect(events[0].payload.task_id).toBe(task.task_id)
    expect(events[0].ts).toBeTruthy()
  })

  it('heartbeatAgentRun appends a "heartbeat" event with current_step and progress_pct', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'editing', progress_pct: 25 })
    const events = readEvents(run.run_id)
    expect(events.length).toBe(2)
    expect(events[1].event_type).toBe('heartbeat')
    expect(events[1].payload.current_step).toBe('editing')
    expect(events[1].payload.progress_pct).toBe(25)
  })

  it('completeAgentRun appends a "completed" event with output_summary', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    await completeAgentRun({ run_id: run.run_id, output_summary: 'all done' })
    const events = readEvents(run.run_id)
    const completed = events.find(e => e.event_type === 'completed')
    expect(completed).toBeDefined()
    expect(completed!.payload.output_summary).toBe('all done')
  })

  it('blockAgentRun appends a "blocked" event with reason', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    await blockAgentRun({ run_id: run.run_id, reason: 'waiting on API docs' })
    const events = readEvents(run.run_id)
    const blocked = events.find(e => e.event_type === 'blocked')
    expect(blocked).toBeDefined()
    expect(blocked!.payload.reason).toBe('waiting on API docs')
  })

  it('escalateRun appends an "escalated" event', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    await escalateRun({ run_id: run.run_id, escalation_reason: 'out of scope' })
    const events = readEvents(run.run_id)
    const escalated = events.find(e => e.event_type === 'escalated')
    expect(escalated).toBeDefined()
    expect(escalated!.payload.reason).toBe('out of scope')
  })

  it('multiple heartbeats accumulate in order', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ task_id: task.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'step 1', progress_pct: 10 })
    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'step 2', progress_pct: 50 })
    await heartbeatAgentRun({ run_id: run.run_id, current_step: 'step 3', progress_pct: 90 })
    const events = readEvents(run.run_id)
    const heartbeats = events.filter(e => e.event_type === 'heartbeat')
    expect(heartbeats.length).toBe(3)
    expect(heartbeats[0].payload.current_step).toBe('step 1')
    expect(heartbeats[2].payload.current_step).toBe('step 3')
  })
})

describe('run lifecycle memory hooks (L-9, L-10)', () => {
  type RunEvent = { ts: string; event_type: string; payload: Record<string, unknown> }

  it('startAgentRun recalls task-scoped memories and stores them in the started event', async () => {
    const task = await seedTask()
    // Seed a task-scoped memory the agent should see at startup
    await writeMemory({
      content: 'prior context about the implementation approach',
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      task_id: task.task_id,
      kind: 'task_decision',
      scope: 'task',
    })

    const run = await startAgentRun({
      workspace_id: 'ws_1',
      task_id: task.task_id,
      role: 'software_engineer',
    })

    const row = getDb().prepare('SELECT events FROM agent_runs WHERE run_id = ?').get(run.run_id) as { events: string }
    const events = JSON.parse(row.events) as RunEvent[]
    const started = events.find(e => e.event_type === 'started')
    expect(started).toBeDefined()
    const recalled = started!.payload.recalled_memories as Array<{ memory_id: string; kind: string; content: string }>
    expect(Array.isArray(recalled)).toBe(true)
    expect(recalled.length).toBeGreaterThanOrEqual(1)
    expect(recalled[0]).toHaveProperty('memory_id')
    expect(recalled[0]).toHaveProperty('kind')
    expect(recalled[0]).toHaveProperty('content')
  })

  it('completeAgentRun auto-writes a task_outcome memory when summary is non-trivial', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ workspace_id: 'ws_1', task_id: task.task_id, role: 'software_engineer' })
    await completeAgentRun({
      run_id: run.run_id,
      output_summary: 'Implemented the feature and added 5 tests, all passing.',
      artifacts: { files_changed: ['src/foo.ts', 'src/bar.ts'] },
    })
    const memoryRows = getDb().prepare(
      "SELECT * FROM memories WHERE task_id = ? AND kind = 'task_outcome'"
    ).all(task.task_id) as Array<Record<string, unknown>>
    expect(memoryRows.length).toBeGreaterThanOrEqual(1)
    expect(memoryRows[0].content).toContain('Implemented the feature')
  })

  it('completeAgentRun skips auto-memory when summary is trivial or missing', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ workspace_id: 'ws_1', task_id: task.task_id, role: 'software_engineer' })
    await completeAgentRun({ run_id: run.run_id, output_summary: 'ok' })
    const memoryRows = getDb().prepare(
      "SELECT * FROM memories WHERE task_id = ? AND kind = 'task_outcome'"
    ).all(task.task_id) as Array<Record<string, unknown>>
    expect(memoryRows.length).toBe(0)
  })

  it('blockAgentRun auto-writes a task_failure memory', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ workspace_id: 'ws_1', task_id: task.task_id, role: 'software_engineer' })
    await blockAgentRun({ run_id: run.run_id, reason: 'missing API credentials' })
    const memoryRows = getDb().prepare(
      "SELECT * FROM memories WHERE task_id = ? AND kind = 'task_failure'"
    ).all(task.task_id) as Array<Record<string, unknown>>
    expect(memoryRows.length).toBeGreaterThanOrEqual(1)
    expect(memoryRows[0].content).toContain('missing API credentials')
  })

  it('escalateRun auto-writes a task_decision memory', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ workspace_id: 'ws_1', task_id: task.task_id, role: 'software_engineer' })
    await escalateRun({ run_id: run.run_id, escalation_reason: 'requires architecture review' })
    const memoryRows = getDb().prepare(
      "SELECT * FROM memories WHERE task_id = ? AND kind = 'task_decision'"
    ).all(task.task_id) as Array<Record<string, unknown>>
    expect(memoryRows.length).toBeGreaterThanOrEqual(1)
    expect(memoryRows[0].content).toContain('requires architecture review')
  })

  it('recall failure never prevents startAgentRun (empty DB returns [])', async () => {
    const task = await seedTask()
    const run = await startAgentRun({ workspace_id: 'ws_1', task_id: task.task_id, role: 'software_engineer' })
    const row = getDb().prepare('SELECT events FROM agent_runs WHERE run_id = ?').get(run.run_id) as { events: string }
    const events = JSON.parse(row.events) as RunEvent[]
    const started = events.find(e => e.event_type === 'started')
    expect(started!.payload.recalled_memories).toEqual([])
  })
})
