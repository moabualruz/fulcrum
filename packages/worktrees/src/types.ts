// packages/worktrees/src/types.ts
import type { ArtifactType } from '@fulcrum/core'
export type { ArtifactType }

export type ArtifactStatus = 'draft' | 'final' | 'archived'
export type ReviewStatus = 'pending' | 'changes_requested' | 'approved' | 'rejected'
export type ReviewTargetType = 'task' | 'artifact' | 'worktree'
export type WorktreeStatus = 'allocated' | 'dirty' | 'ready_for_merge' | 'merged' | 'discarded'
export type HandoffMode = 'brief' | 'contextual' | 'artifact_first_brief' | 'branched_session'

export interface Artifact {
  artifact_id: string
  workspace_id: string
  project_id: string
  display_id: string
  artifact_type: ArtifactType
  title: string
  file_path: string
  owner_type: string
  owner_id: string
  status: ArtifactStatus
  content_hash?: string
  created_at: string
  updated_at: string
}

export interface Review {
  review_id: string
  workspace_id: string
  project_id: string
  display_id: string
  target_type: ReviewTargetType
  target_id: string
  status: ReviewStatus
  reviewer_agent_id?: string
  summary?: string
  file_path?: string
  created_at: string
  updated_at: string
}

export interface Worktree {
  worktree_id: string
  workspace_id: string
  project_id: string
  status: WorktreeStatus
  branch_name: string
  path: string
  task_id?: string
  run_id?: string
  created_at: string
  updated_at: string
  merged_at?: string
  discarded_at?: string
}

export interface MergeResult {
  worktree_id: string
  branch_name: string
  success: boolean
  error?: string
  merged_at?: string
}

export interface AllocateWorktreeInput {
  workspace_id: string
  project_id: string
  branch_name: string
  path: string
  task_id?: string
  run_id?: string
}

export interface MarkDirtyInput {
  worktree_id: string
}

export interface MarkReadyInput {
  worktree_id: string
}

export interface EnqueueMergeInput {
  worktree_id: string
  priority?: number
}

export interface DiscardWorktreeInput {
  worktree_id: string
  reason?: string
}

export interface MergeReadinessCheck {
  worktree_id: string
  passed: boolean
  failures: string[]
}

export interface Handoff {
  handoff_id: string
  workspace_id: string
  project_id: string
  from_agent_id: string
  to_agent_id: string
  task_id?: string
  issue_id?: string
  goal: string
  task_type?: string
  priority: string
  scope: string
  inputs: Record<string, unknown>
  constraints: string[]
  done_criteria: string[]
  artifact_contract_id?: string
  handoff_mode: HandoffMode
  created_at: string
}

export interface ArtifactContract {
  contract_id: string
  task_id?: string
  required_artifacts: string[]
  optional_artifacts: string[]
  final_summary_artifact?: string
  review_inputs: string[]
  merge_readiness_rules: string[]
  created_at: string
  updated_at: string
}
