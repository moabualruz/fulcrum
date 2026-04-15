// packages/workflows/src/workflows.ts
import { getDb, nextDisplayId, newId, Db} from '@fulcrum/core'
import { registry } from './registry.js'
import { nextReadySteps, initStepStates, computeStatusCategory } from './engine.js'
import type {
  WorkflowRun,
  WorkflowDefinition,
  WorkflowStepState,
  StartWorkflowInput,
  StepWorkflowInput,
  ResumeWorkflowInput,
  CancelWorkflowInput,
  GetWorkflowRunInput,
} from './types.js'

// ── helpers ────────────────────────────────────────────────────────────────

function rowToRun(row: Record<string, unknown>): WorkflowRun {
  return {
    wf_id: row['wf_id'] as string,
    workspace_id: row['workspace_id'] as string,
    project_id: (row['project_id'] as string | null) ?? undefined,
    display_id: row['display_id'] as string,
    workflow_name: row['workflow_name'] as string,
    workflow_version: row['workflow_version'] as string,
    status: row['status'] as WorkflowRun['status'],
    status_category: row['status_category'] as WorkflowRun['status_category'],
    task_id: (row['task_id'] as string | null) ?? undefined,
    issue_id: (row['issue_id'] as string | null) ?? undefined,
    steps: (() => {
      const parsed = JSON.parse(row['steps'] as string) as unknown
      if (Array.isArray(parsed)) return parsed as WorkflowStepState[]
      const obj = parsed as { states?: WorkflowStepState[] }
      return obj.states ?? []
    })(),
    current_step_id: (row['current_step_id'] as string | null) ?? undefined,
    handoff_refs: JSON.parse(row['handoff_refs'] as string) as string[],
    artifact_refs: JSON.parse(row['artifact_refs'] as string) as string[],
    error: (row['error'] as string | null) ?? undefined,
    version: row['version'] as number,
    created_at: row['created_at'] as string,
    updated_at: row['updated_at'] as string,
    started_at: (row['started_at'] as string | null) ?? undefined,
    completed_at: (row['completed_at'] as string | null) ?? undefined,
  }
}

function fetchRun(wf_id: string, workspace_id: string, db: Db = getDb()): WorkflowRun {
  const row = db.prepare(`SELECT * FROM workflow_runs WHERE wf_id = ? AND workspace_id = ?`).get(wf_id, workspace_id) as Record<string, unknown> | undefined
  if (!row) throw new Error(`workflow run not found: ${wf_id}`)
  return rowToRun(row)
}

/**
 * Given updated step states, determines the workflow's top-level status.
 * Waits if the current step is prompt_user or wait_for_task.
 */
function deriveWorkflowStatus(
  steps: WorkflowStepState[],
  def: WorkflowDefinition,
  currentStepId?: string
): WorkflowRun['status'] {
  const cat = computeStatusCategory(steps)
  if (cat === 'done') return 'completed'
  if (cat === 'blocked') return 'failed'

  if (currentStepId) {
    const stepDef = def.steps.find(s => s.step_id === currentStepId)
    if (stepDef?.step_type === 'prompt_user') return 'waiting_input'
    if (stepDef?.step_type === 'wait_for_task') return 'waiting_dependency'
  }

  return 'running'
}

// ── public API ─────────────────────────────────────────────────────────────

export async function startWorkflow(input: StartWorkflowInput, db: Db = getDb()): Promise<WorkflowRun> {
  const def = registry.getDefinition(input.workflow_name)
  if (!def) throw new Error(`workflow not found: ${input.workflow_name}`)
  const wf_id = newId('wf')
  const now = new Date().toISOString()
  const display_id = nextDisplayId('wf', input.project_id ?? input.workspace_id, db)

  // Initialise all steps as pending
  const steps = initStepStates(def.steps)

  // Advance first ready steps to 'running'
  const readyIds = nextReadySteps(steps, def.steps)
  for (const sid of readyIds) {
    const s = steps.find(s => s.step_id === sid)!
    s.status = 'running'
    s.started_at = now
  }
  const current_step_id = readyIds[0] ?? undefined

  // Initial status is always 'running' — prompt_user pausing happens on stepWorkflow
  const status: WorkflowRun['status'] = 'running'
  const status_category = 'active'

  db.prepare(
    `INSERT INTO workflow_runs(
       wf_id, workspace_id, project_id, display_id, workflow_name, workflow_version,
       status, status_category, task_id, issue_id,
       steps, current_step_id, handoff_refs, artifact_refs,
       version, created_at, updated_at, started_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', 0, ?, ?, ?)`
  ).run(
    wf_id,
    input.workspace_id,
    input.project_id ?? null,
    display_id,
    input.workflow_name,
    def.version,
    status,
    status_category,
    input.task_id ?? null,
    input.issue_id ?? null,
    JSON.stringify({ states: steps, defs: def.steps }),
    current_step_id ?? null,
    now,
    now,
    now
  )

  return fetchRun(wf_id, input.workspace_id, db)
}

export async function stepWorkflow(input: StepWorkflowInput, db: Db = getDb()): Promise<WorkflowRun> {
  const run = fetchRun(input.wf_id, input.workspace_id, db)
  const def = registry.getDefinition(run.workflow_name)
  if (!def) throw new Error(`workflow definition not found: ${run.workflow_name}`)

  const now = new Date().toISOString()
  const steps = run.steps

  // Update the stepped step's state
  const stepState = steps.find(s => s.step_id === input.step_id)
  if (!stepState) throw new Error(`step not found in run: ${input.step_id}`)

  // Determine if this is a prompt_user/wait_for_task step being called without a result
  const steppedDef = def.steps.find(s => s.step_id === input.step_id)
  const isWaitingStepType = steppedDef?.step_type === 'prompt_user' || steppedDef?.step_type === 'wait_for_task'
  const isPauseCall = isWaitingStepType && input.result === undefined && !input.error

  stepState.attempts += 1
  if (input.error) {
    stepState.status = 'failed'
    stepState.error = input.error
    stepState.completed_at = now
  } else if (isPauseCall) {
    // Pause: leave step in 'waiting' state — resume will complete it
    stepState.status = 'waiting'
  } else {
    stepState.status = 'completed'
    if (input.result !== undefined) stepState.result = input.result
    stepState.completed_at = now
  }

  // Compute next ready steps and advance them (only when step is completed)
  const readyIds = stepState.status === 'completed' ? nextReadySteps(steps, def.steps) : []
  for (const sid of readyIds) {
    const s = steps.find(s => s.step_id === sid)!
    s.status = 'running'
    s.started_at = now
  }
  const current_step_id = readyIds[0] ?? run.current_step_id

  // Determine status
  let status: WorkflowRun['status']
  if (isPauseCall) {
    status = steppedDef?.step_type === 'wait_for_task' ? 'waiting_dependency' : 'waiting_input'
  } else {
    status = deriveWorkflowStatus(steps, def, current_step_id)
  }
  const status_category: WorkflowRun['status_category'] =
    status === 'completed' || status === 'cancelled' ? 'done'
    : status === 'failed' ? 'blocked'
    : 'active'
  const completed_at = status === 'completed' ? now : null

  db.prepare(
    `UPDATE workflow_runs
     SET steps = ?, current_step_id = ?, status = ?, status_category = ?,
         completed_at = COALESCE(completed_at, ?), version = version + 1, updated_at = ?
     WHERE wf_id = ?`
  ).run(
    JSON.stringify(steps),
    current_step_id ?? null,
    status,
    status_category,
    completed_at,
    now,
    input.wf_id
  )

  return fetchRun(input.wf_id, input.workspace_id, db)
}

export async function resumeWorkflow(input: ResumeWorkflowInput, db: Db = getDb()): Promise<WorkflowRun> {
  const run = fetchRun(input.wf_id, input.workspace_id, db)
  const def = registry.getDefinition(run.workflow_name)
  if (!def) throw new Error(`workflow definition not found: ${run.workflow_name}`)

  const now = new Date().toISOString()
  const steps = run.steps

  // Mark the current waiting step as completed (the user/task provided the input)
  if (run.current_step_id) {
    const waitingStep = steps.find(s => s.step_id === run.current_step_id)
    if (waitingStep && (waitingStep.status === 'running' || waitingStep.status === 'waiting')) {
      waitingStep.status = 'completed'
      if (input.resume_data !== undefined) waitingStep.result = input.resume_data
      waitingStep.completed_at = now
    }
  }

  // Recompute ready steps
  const readyIds = nextReadySteps(steps, def.steps)
  for (const sid of readyIds) {
    const s = steps.find(s => s.step_id === sid)!
    s.status = 'running'
    s.started_at = now
  }
  const current_step_id = readyIds[0] ?? run.current_step_id

  const derivedStatus = deriveWorkflowStatus(steps, def, current_step_id)
  const statusCat: WorkflowRun['status_category'] =
    derivedStatus === 'completed' || derivedStatus === 'cancelled' ? 'done'
    : derivedStatus === 'failed' ? 'blocked'
    : 'active'
  const completed_at = derivedStatus === 'completed' ? now : null

  db.prepare(
    `UPDATE workflow_runs
     SET steps = ?, current_step_id = ?, status = ?, status_category = ?,
         completed_at = COALESCE(completed_at, ?), version = version + 1, updated_at = ?
     WHERE wf_id = ?`
  ).run(JSON.stringify(steps), current_step_id ?? null, derivedStatus, statusCat, completed_at, now, input.wf_id)

  return fetchRun(input.wf_id, input.workspace_id, db)
}

export async function cancelWorkflow(input: CancelWorkflowInput, db: Db = getDb()): Promise<WorkflowRun> {
  const now = new Date().toISOString()

  // Include workspace_id in WHERE clause to prevent cross-workspace cancellation (WORK-002).
  db.prepare(
    `UPDATE workflow_runs
     SET status = 'cancelled', status_category = 'done',
         error = ?, version = version + 1, updated_at = ?, completed_at = COALESCE(completed_at, ?)
     WHERE wf_id = ? AND workspace_id = ?`
  ).run(input.reason ?? null, now, now, input.wf_id, input.workspace_id)

  return fetchRun(input.wf_id, input.workspace_id, db)
}

export async function listWorkflows(): Promise<WorkflowDefinition[]> {
  return registry.listAll()
}

export async function getWorkflowRun(input: GetWorkflowRunInput, db: Db = getDb()): Promise<WorkflowRun> {
  return fetchRun(input.wf_id, input.workspace_id, db)
}
