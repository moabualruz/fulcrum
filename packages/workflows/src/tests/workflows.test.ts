// packages/workflows/src/tests/workflows.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seed } from './helpers.js'
import type Database from 'better-sqlite3'
import {
  startWorkflow,
  stepWorkflow,
  resumeWorkflow,
  cancelWorkflow,
  listWorkflows,
  getWorkflowRun,
} from '../workflows.js'

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

describe('listWorkflows', () => {
  it('returns all 4 built-in workflow definitions', async () => {
    const defs = await listWorkflows()
    expect(defs).toHaveLength(4)
    const names = defs.map(d => d.name)
    expect(names).toContain('grill-me')
    expect(names).toContain('write-a-prd')
    expect(names).toContain('prd-to-plan')
    expect(names).toContain('prd-to-issues')
  })

  it('each definition has steps array with step_type fields', async () => {
    const defs = await listWorkflows()
    for (const def of defs) {
      expect(def.steps.length).toBeGreaterThan(0)
      for (const step of def.steps) {
        expect(step.step_id).toBeTruthy()
        expect(step.step_type).toBeTruthy()
        expect(step.name).toBeTruthy()
      }
    }
  })
})

describe('startWorkflow', () => {
  it('creates a run with correct initial state for grill-me', async () => {
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })

    expect(run.wf_id).toMatch(/^wf_/)
    expect(run.display_id).toBeTruthy()
    expect(run.workflow_name).toBe('grill-me')
    expect(run.workflow_version).toBe('1.0')
    expect(run.workspace_id).toBe(workspace_id)
    expect(run.status).toBe('running')
    expect(run.status_category).toBe('active')
    expect(run.steps).toHaveLength(5) // grill-me has 5 steps
    expect(run.steps.every(s => ['pending', 'running'].includes(s.status))).toBe(true)
    expect(run.started_at).toBeTruthy()
    expect(run.version).toBe(0)
  })

  it('sets current_step_id to the first ready step', async () => {
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })
    // 'ask' has no depends_on — should be first ready step
    expect(run.current_step_id).toBe('ask')
  })

  it('throws when workflow_name is not found in registry', async () => {
    await expect(
      startWorkflow({ workflow_name: 'nonexistent-workflow', workspace_id })
    ).rejects.toThrow('workflow not found: nonexistent-workflow')
  })
})

describe('stepWorkflow', () => {
  it('marks step completed and advances to next ready step', async () => {
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })
    // Step 'ask' is current — advance it
    const updated = await stepWorkflow({
      wf_id: run.wf_id,
      workspace_id,
      step_id: 'ask',
      result: { answers: ['use TypeScript', 'prefer ESM'] },
    })

    const askState = updated.steps.find(s => s.step_id === 'ask')
    expect(askState?.status).toBe('completed')
    expect(askState?.result).toEqual({ answers: ['use TypeScript', 'prefer ESM'] })
    expect(askState?.completed_at).toBeTruthy()
    // 'search' and 'recall' both depend on 'ask' — both are now ready
    // current_step_id advances to one of them
    expect(['search', 'recall']).toContain(updated.current_step_id)
  })

  it('sets workflow status to waiting_input when step_type is prompt_user', async () => {
    // 'grill-me' step 'ask' is prompt_user and the first step
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })

    // The step itself triggers a prompt_user pause — simulate by stepping with no result yet
    // To test waiting_input, start 'write-a-prd' which has prompt_user after recall
    const prdRun = await startWorkflow({ workflow_name: 'write-a-prd', workspace_id })
    // Step 'recall' first (read_memory, no waiting)
    const afterRecall = await stepWorkflow({ wf_id: prdRun.wf_id, workspace_id, step_id: 'recall', result: {} })
    // Now 'prompt' step (prompt_user) is ready — stepping it should pause at waiting_input
    const afterPrompt = await stepWorkflow({ wf_id: afterRecall.wf_id, workspace_id, step_id: 'prompt' })
    expect(afterPrompt.status).toBe('waiting_input')
  })

  it('marks step failed and records error message', async () => {
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })
    const updated = await stepWorkflow({
      wf_id: run.wf_id,
      workspace_id,
      step_id: 'ask',
      error: 'Agent timeout after 30s',
    })

    const askState = updated.steps.find(s => s.step_id === 'ask')
    expect(askState?.status).toBe('failed')
    expect(askState?.error).toBe('Agent timeout after 30s')
    expect(updated.status_category).toBe('blocked')
  })

  it('sets status completed and status_category done when all steps complete', async () => {
    // Use prd-to-issues: 4 steps, no prompt_user or wait_for_task
    const run = await startWorkflow({ workflow_name: 'prd-to-issues', workspace_id })

    // Step through all non-final steps
    let current = run
    current = await stepWorkflow({ wf_id: current.wf_id, workspace_id, step_id: 'recall', result: {} })
    current = await stepWorkflow({ wf_id: current.wf_id, workspace_id, step_id: 'agent', result: {} })
    current = await stepWorkflow({ wf_id: current.wf_id, workspace_id, step_id: 'issues', result: {} })
    current = await stepWorkflow({ wf_id: current.wf_id, workspace_id, step_id: 'done', result: {} })

    expect(current.status).toBe('completed')
    expect(current.status_category).toBe('done')
    expect(current.completed_at).toBeTruthy()
  })
})

describe('resumeWorkflow', () => {
  it('moves from waiting_input back to running', async () => {
    const prdRun = await startWorkflow({ workflow_name: 'write-a-prd', workspace_id })
    let current = await stepWorkflow({ wf_id: prdRun.wf_id, workspace_id, step_id: 'recall', result: {} })
    current = await stepWorkflow({ wf_id: current.wf_id, workspace_id, step_id: 'prompt' })
    expect(current.status).toBe('waiting_input')

    const resumed = await resumeWorkflow({
      wf_id: current.wf_id,
      workspace_id,
      resume_data: { user_input: 'Build a REST API' },
    })

    expect(resumed.status).toBe('running')
    expect(resumed.status_category).toBe('active')
    // After resume, the prompt step should be completed and next step ready
    const promptState = resumed.steps.find(s => s.step_id === 'prompt')
    expect(promptState?.status).toBe('completed')
  })
})

describe('cancelWorkflow', () => {
  it('sets status cancelled and status_category done', async () => {
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })
    const cancelled = await cancelWorkflow({ wf_id: run.wf_id, workspace_id, reason: 'User aborted' })

    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.status_category).toBe('done')
    expect(cancelled.error).toBe('User aborted')
  })

  it('sets status cancelled with no reason when reason is omitted', async () => {
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })
    const cancelled = await cancelWorkflow({ wf_id: run.wf_id, workspace_id })

    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.status_category).toBe('done')
  })
})

describe('getWorkflowRun', () => {
  it('retrieves a persisted run by wf_id', async () => {
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })
    const fetched = await getWorkflowRun({ wf_id: run.wf_id, workspace_id })

    expect(fetched.wf_id).toBe(run.wf_id)
    expect(fetched.workflow_name).toBe('grill-me')
    expect(fetched.steps).toHaveLength(5)
  })

  it('throws when wf_id is not found', async () => {
    await expect(getWorkflowRun({ wf_id: 'wf_nonexistent', workspace_id })).rejects.toThrow(
      'workflow run not found: wf_nonexistent'
    )
  })
})

describe('full grill-me happy path', () => {
  it('completes all 5 steps in order and ends with status completed', async () => {
    // grill-me steps: ask → (search, recall) → save → done
    const run = await startWorkflow({ workflow_name: 'grill-me', workspace_id })
    expect(run.current_step_id).toBe('ask')

    // ask is prompt_user — stepping it pauses at waiting_input
    let current = await stepWorkflow({ wf_id: run.wf_id, workspace_id, step_id: 'ask' })
    expect(current.status).toBe('waiting_input')

    // resume from user input
    current = await resumeWorkflow({ wf_id: current.wf_id, workspace_id, resume_data: { answers: ['TypeScript'] } })
    expect(current.status).toBe('running')

    // search and recall are now both ready — step them in any order
    current = await stepWorkflow({ wf_id: current.wf_id, workspace_id, step_id: 'search', result: { results: [] } })
    current = await stepWorkflow({ wf_id: current.wf_id, workspace_id, step_id: 'recall', result: { memories: [] } })

    // save is now ready
    current = await stepWorkflow({ wf_id: current.wf_id, workspace_id, step_id: 'save', result: {} })

    // done step completes the run
    current = await stepWorkflow({ wf_id: current.wf_id, workspace_id, step_id: 'done', result: {} })

    expect(current.status).toBe('completed')
    expect(current.status_category).toBe('done')
    expect(current.completed_at).toBeTruthy()
    expect(current.steps.every(s => s.status === 'completed')).toBe(true)
  })
})
