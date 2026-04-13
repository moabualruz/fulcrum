// packages/workflows/src/types.ts

export type WorkflowStepType =
  | 'prompt_user' | 'read_memory' | 'write_memory' | 'spawn_agent'
  | 'create_task' | 'create_issue' | 'write_artifact' | 'read_artifact'
  | 'evaluate_policy' | 'search_web' | 'search_code' | 'run_tool'
  | 'wait_for_task' | 'wait_for_review' | 'branch' | 'parallel' | 'complete'

export interface WorkflowStepDef {
  step_id: string
  step_type: WorkflowStepType
  name: string
  config: Record<string, unknown>
  depends_on?: string[]
  max_retries?: number
  timeout_ms?: number
}

export interface WorkflowStepState {
  step_id: string
  status: 'pending' | 'running' | 'waiting' | 'completed' | 'failed' | 'skipped'
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
