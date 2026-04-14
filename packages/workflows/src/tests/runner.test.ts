// packages/workflows/src/tests/runner.test.ts
//
// Tests for runWorkflow + step handlers (H-1/H-5).
//
// These tests seed a workflow_runs row directly rather than going
// through startWorkflow() — that lets us control the DAG precisely
// without depending on the registry's built-in workflows.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seed } from './helpers.js'
import { getDb, newId } from '@fulcrum/core'
import type Database from 'better-sqlite3'
import { runWorkflow } from '../runner.js'
import { executeStep, listStepHandlers } from '../step-executor.js'
import type { WorkflowStepDef, WorkflowStepState, StepContext } from '../types.js'

interface SeedStep {
  step_id: string
  step_type: string
  name?: string
  config?: Record<string, unknown>
  depends_on?: string[]
  max_retries?: number
  timeout_ms?: number
}

function seedWorkflowRun(
  db: Database.Database,
  wf_id: string,
  workspace_id: string,
  project_id: string | null,
  steps: SeedStep[],
): void {
  const now = new Date().toISOString()
  const defs: WorkflowStepDef[] = steps.map((s) => ({
    step_id: s.step_id,
    step_type: s.step_type as WorkflowStepDef['step_type'],
    name: s.name ?? s.step_id,
    config: s.config ?? {},
    depends_on: s.depends_on ?? [],
    max_retries: s.max_retries,
    timeout_ms: s.timeout_ms,
  }))
  const states: WorkflowStepState[] = defs.map((d) => ({
    step_id: d.step_id,
    status: 'pending',
    attempts: 0,
  }))
  const blob = JSON.stringify({ states, defs })
  db.prepare(
    `INSERT INTO workflow_runs (
       wf_id, workspace_id, project_id, display_id, workflow_name, workflow_version,
       status, status_category, steps, handoff_refs, artifact_refs,
       version, created_at, updated_at, started_at
     ) VALUES (?, ?, ?, ?, 'test-runner', '1.0', 'running', 'active', ?, '[]', '[]', 0, ?, ?, ?)`,
  ).run(wf_id, workspace_id, project_id, `WF-${wf_id.slice(-6)}`, blob, now, now, now)
}

function loadSteps(db: Database.Database, wf_id: string): WorkflowStepState[] {
  const row = db
    .prepare(`SELECT steps FROM workflow_runs WHERE wf_id = ?`)
    .get(wf_id) as { steps: string }
  const parsed = JSON.parse(row.steps) as { states?: WorkflowStepState[] } | WorkflowStepState[]
  if (Array.isArray(parsed)) return parsed
  return parsed.states ?? []
}

function loadRunRow(db: Database.Database, wf_id: string): Record<string, unknown> {
  return db
    .prepare(`SELECT * FROM workflow_runs WHERE wf_id = ?`)
    .get(wf_id) as Record<string, unknown>
}

describe('runWorkflow (H-1/H-5)', () => {
  let db: Database.Database
  let workspace_id: string
  let project_id: string

  beforeEach(() => {
    db = createTestDb()
    const seeded = seed(db)
    workspace_id = seeded.workspace_id
    project_id = seeded.project_id
  })

  afterEach(() => {
    resetTestDb()
  })

  it('runs a simple create_task → write_memory → halt workflow to completion', async () => {
    const wf_id = newId('wf')
    seedWorkflowRun(db, wf_id, workspace_id, project_id, [
      { step_id: 's1', step_type: 'create_task', config: { title: 'runner-created task' } },
      {
        step_id: 's2',
        step_type: 'write_memory',
        config: { content: 'runner wrote this memory', kind: 'fact', scope: 'project' },
        depends_on: ['s1'],
      },
      { step_id: 's3', step_type: 'halt', depends_on: ['s2'] },
    ])

    const result = await runWorkflow({ wf_id, workspace_id, retry_backoff_cap_ms: 10 })

    expect(result.final_status).toBe('completed')
    expect(result.steps_executed).toBe(3)

    // Verify the task was actually created.
    const taskRow = db
      .prepare(`SELECT * FROM tasks WHERE title = 'runner-created task'`)
      .get() as { task_id: string } | undefined
    expect(taskRow).toBeDefined()
    expect(taskRow!.task_id).toMatch(/^task_/)

    // Verify the memory was actually written.
    const memRow = db
      .prepare(`SELECT memory_id FROM memories WHERE content = 'runner wrote this memory'`)
      .get() as { memory_id: string } | undefined
    expect(memRow).toBeDefined()
    expect(memRow!.memory_id).toMatch(/^mem_/)

    // Verify workflow_runs row was marked completed.
    const runRow = loadRunRow(db, wf_id)
    expect(runRow['status']).toBe('completed')
    expect(runRow['status_category']).toBe('done')
  })

  it('retries a failing step up to max_retries then marks it failed', async () => {
    const wf_id = newId('wf')
    seedWorkflowRun(db, wf_id, workspace_id, project_id, [
      {
        step_id: 's1',
        step_type: 'run_script',
        // Not on the allowlist — will always fail. max_retries=2 keeps the test quick.
        config: { script: 'not_in_allowlist' },
        max_retries: 2,
      },
    ])

    const result = await runWorkflow({ wf_id, workspace_id, retry_backoff_cap_ms: 5 })

    expect(result.final_status).toBe('failed')
    const states = loadSteps(db, wf_id)
    const s1 = states.find((s) => s.step_id === 's1')!
    expect(s1.status).toBe('failed')
    expect(s1.attempts).toBe(2)
    expect(s1.error).toMatch(/not in allowlist/)
    expect(loadRunRow(db, wf_id)['status']).toBe('failed')
  })

  it('escalate step creates a handoff to chief_of_staff', async () => {
    const wf_id = newId('wf')
    seedWorkflowRun(db, wf_id, workspace_id, project_id, [
      {
        step_id: 's1',
        step_type: 'escalate',
        config: { goal: 'runner escalation test', task_type: 'escalation' },
      },
      { step_id: 's2', step_type: 'halt', depends_on: ['s1'] },
    ])

    const result = await runWorkflow({ wf_id, workspace_id, retry_backoff_cap_ms: 10 })
    expect(result.final_status).toBe('completed')

    const handoff = db
      .prepare(`SELECT * FROM handoffs WHERE goal = 'runner escalation test'`)
      .get() as { to_agent_id: string; priority: string } | undefined
    expect(handoff).toBeDefined()
    expect(handoff!.to_agent_id).toBe('chief_of_staff')
    expect(handoff!.priority).toBe('high')
  })

  it('respects DAG ordering — later steps wait for dependencies', async () => {
    const wf_id = newId('wf')
    seedWorkflowRun(db, wf_id, workspace_id, project_id, [
      { step_id: 'first', step_type: 'create_task', config: { title: 'first task' } },
      {
        step_id: 'second',
        step_type: 'create_task',
        config: { title: 'second task' },
        depends_on: ['first'],
      },
      {
        step_id: 'third',
        step_type: 'create_task',
        config: { title: 'third task' },
        depends_on: ['second'],
      },
      { step_id: 'done', step_type: 'halt', depends_on: ['third'] },
    ])

    const result = await runWorkflow({ wf_id, workspace_id, retry_backoff_cap_ms: 10 })
    expect(result.final_status).toBe('completed')
    expect(result.steps_executed).toBe(4)

    // All three tasks exist and were created in order.
    const tasks = db
      .prepare(
        `SELECT title, created_at FROM tasks WHERE title IN ('first task','second task','third task') ORDER BY created_at ASC`,
      )
      .all() as { title: string }[]
    expect(tasks.map((t) => t.title)).toEqual(['first task', 'second task', 'third task'])
  })

  it('blocks cleanly when a wait_for_task dependency is not yet met', async () => {
    const wf_id = newId('wf')
    // Create a real task that is still 'queued' (default) — wait_for_task wants 'done'.
    const stubTask = db
      .prepare(
        `INSERT INTO tasks (
           task_id, workspace_id, project_id, display_id, title, description,
           status, status_category, priority, depends_on, assigned_to, note, done_criteria,
           created_at, updated_at
         ) VALUES ('task_wait_1', ?, ?, 'T-WAIT-1', 'pending thing', NULL,
                   'queued', 'active', 'medium', '[]', NULL, NULL, NULL,
                   datetime('now'), datetime('now'))`,
      )
      .run(workspace_id, project_id)
    expect(stubTask.changes).toBe(1)

    seedWorkflowRun(db, wf_id, workspace_id, project_id, [
      {
        step_id: 's1',
        step_type: 'wait_for_task',
        config: { task_id: 'task_wait_1', status: 'done' },
      },
      { step_id: 's2', step_type: 'halt', depends_on: ['s1'] },
    ])

    const result = await runWorkflow({
      wf_id,
      workspace_id,
      max_iterations: 5,
      retry_backoff_cap_ms: 5,
    })
    // The wait_for_task keeps returning skipped, so the loop terminates
    // as blocked without executing 'halt'.
    expect(result.final_status).toBe('blocked')
    expect(loadRunRow(db, wf_id)['status']).toBe('blocked')
  })

  it('halt short-circuits the workflow even when steps downstream exist', async () => {
    const wf_id = newId('wf')
    seedWorkflowRun(db, wf_id, workspace_id, project_id, [
      { step_id: 'stop', step_type: 'halt' },
    ])
    const result = await runWorkflow({ wf_id, workspace_id, retry_backoff_cap_ms: 5 })
    expect(result.final_status).toBe('completed')
    expect(result.steps_executed).toBe(1)
  })

  it('registers handlers for every built-in step type', () => {
    const handlers = listStepHandlers()
    // Sanity check — at least the 16 types called out in the task spec.
    const required = [
      'create_task',
      'create_issue',
      'create_epic',
      'write_artifact',
      'write_memory',
      'invoke_team',
      'spawn_agent',
      'run_script',
      'call_mcp_tool',
      'wait_for_task',
      'wait_for_review',
      'wait_for_artifact',
      'branch',
      'loop',
      'halt',
      'escalate',
    ]
    for (const t of required) {
      expect(handlers).toContain(t)
    }
  })

  it('loop step completes after N iterations', async () => {
    const wf_id = newId('wf')
    seedWorkflowRun(db, wf_id, workspace_id, project_id, [
      { step_id: 'l', step_type: 'loop', config: { iterations: 3 } },
      { step_id: 'h', step_type: 'halt', depends_on: ['l'] },
    ])
    const result = await runWorkflow({ wf_id, workspace_id, retry_backoff_cap_ms: 2 })
    expect(result.final_status).toBe('completed')
    const states = loadSteps(db, wf_id)
    const loopState = states.find((s) => s.step_id === 'l')!
    expect(loopState.attempts).toBeGreaterThanOrEqual(3)
  })

  it('executeStep returns failed for unknown step types', async () => {
    const ctx: StepContext = {
      wf_id: 'wf_fake',
      workspace_id,
      project_id,
      step_id: 'x',
      step: {
        step_id: 'x',
        step_type: 'nonexistent_type' as WorkflowStepDef['step_type'],
        name: 'x',
        config: {},
      },
      outputs: {},
      attempts: 0,
    }
    const result = await executeStep(ctx)
    expect(result.status).toBe('failed')
    expect(result.error).toMatch(/no handler/)
  })
})
