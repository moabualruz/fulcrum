// packages/workflows/src/types.ts

export type WorkflowStepType =
  | 'prompt_user' | 'read_memory' | 'write_memory' | 'spawn_agent'
  | 'create_task' | 'create_issue' | 'create_epic' | 'write_artifact' | 'read_artifact'
  | 'evaluate_policy' | 'search_web' | 'search_code' | 'run_tool'
  | 'wait_for_task' | 'wait_for_review' | 'wait_for_artifact'
  | 'branch' | 'loop' | 'parallel' | 'complete' | 'halt' | 'escalate'
  | 'invoke_team' | 'run_script' | 'call_mcp_tool' | 'read_project' | 'review_artifact'
  | 'validate_schema' | 'gate'

export interface RetryPolicy {
  maxAttempts: number
  backoffMultiplier?: number
  initialDelayMs?: number
  maxDelayMs?: number
}

export interface WorkflowStepDef {
  step_id: string
  step_type: WorkflowStepType
  name: string
  config: Record<string, unknown>
  depends_on?: string[]
  /** @deprecated Use retryPolicy.maxAttempts instead. */
  max_retries?: number
  timeout_ms?: number
  retryPolicy?: RetryPolicy
}

export interface WorkflowStepState {
  step_id: string
  status: 'pending' | 'ready' | 'running' | 'retrying' | 'waiting' | 'waiting_input' | 'waiting_dependency' | 'blocked' | 'completed' | 'failed' | 'skipped'
  result?: unknown
  error?: string
  attempts: number
  started_at?: string
  completed_at?: string
}

export interface WorkflowDefinition {
  name: string
  version: string
  description?: string
  steps: WorkflowStepDef[]
}

export interface WorkflowRun {
  wf_id: string
  workspace_id: string
  project_id?: string
  display_id: string
  workflow_name: string
  workflow_version: string
  status: 'created' | 'ready' | 'running' | 'waiting_input' | 'waiting_dependency' | 'blocked' | 'failed' | 'completed' | 'cancelled'
  status_category: 'backlog' | 'active' | 'blocked' | 'done'
  task_id?: string
  issue_id?: string
  steps: WorkflowStepState[]
  current_step_id?: string
  handoff_refs: string[]
  artifact_refs: string[]
  error?: string
  version: number
  created_at: string
  updated_at: string
  started_at?: string
  completed_at?: string
}

export interface StartWorkflowInput {
  workflow_name: string
  workspace_id: string
  project_id?: string
  task_id?: string
  issue_id?: string
  inputs?: Record<string, unknown>
}

export interface StepWorkflowInput {
  wf_id: string
  workspace_id: string
  step_id: string
  result?: unknown
  error?: string
}

export interface ResumeWorkflowInput {
  wf_id: string
  workspace_id: string
  resume_data?: unknown
}

export interface CancelWorkflowInput {
  wf_id: string
  workspace_id: string
  reason?: string
}

export interface GetWorkflowRunInput {
  wf_id: string
  workspace_id: string
}

// ── Runner types (H-1/H-5) ────────────────────────────────────────────────

/**
 * Runtime context handed to every step handler. The runner builds one
 * of these for each invocation and gives handlers read access to the
 * outputs of every prior step (keyed by step_id).
 */
export interface StepContext {
  /** Workflow run id (the `wf_id` from workflow_runs). */
  wf_id: string
  workspace_id: string
  /** project_id may be undefined for workspace-scoped workflows. */
  project_id?: string
  /** The step being executed. */
  step_id: string
  /** The step definition (step_type, config, depends_on, etc.). */
  step: WorkflowStepDef
  /** Mutable dictionary of prior step outputs, keyed by step_id. */
  outputs: Record<string, unknown>
  /** Current attempts count (0 on the first call, 1 on the first retry, etc.). */
  attempts: number
}

/**
 * Terminal result returned by a handler.
 * - `completed` — step finished successfully; output stored and runner advances.
 * - `skipped`   — step not ready yet (wait_for_*, loop); runner reschedules.
 * - `failed`    — step errored; runner retries up to max_retries then marks failed.
 */
export interface StepResult {
  status: 'completed' | 'skipped' | 'failed'
  output?: unknown
  error?: string
}

export type StepHandler = (ctx: StepContext) => Promise<StepResult>

export interface RunWorkflowInput {
  wf_id: string
  workspace_id: string
  /** Safety cap on total iterations. Default 1000. */
  max_iterations?: number
  /** Per-step timeout in ms, overridable by step.timeout_ms. Default 600_000. */
  default_timeout_ms?: number
  /** Default max retries per step. Default 3. */
  default_max_retries?: number
  /** Optional override for the backoff ceiling in ms (tests use a small value). */
  retry_backoff_cap_ms?: number
}

export interface RunWorkflowResult {
  wf_id: string
  final_status: 'completed' | 'blocked' | 'failed'
  steps_executed: number
  duration_ms: number
}
