// packages/planning/src/types.ts

export type EpicStatus = 'backlog' | 'in_progress' | 'done' | 'cancelled'
export type IssueStatus = 'backlog' | 'ready' | 'in_progress' | 'blocked' | 'in_review' | 'done' | 'cancelled'
export type PRDStatus = 'draft' | 'review' | 'approved' | 'archived'
export type PlanStatus = 'draft' | 'active' | 'completed' | 'archived'
export type Priority = 'critical' | 'high' | 'medium' | 'low' | 'none'
export type EstimateType = 'story_points' | 'hours'
export type StatusCategory = 'backlog' | 'active' | 'blocked' | 'done'
export type TaskRelationType =
  | 'blocks' | 'blocked_by'
  | 'follows' | 'preceded_by'
  | 'relates' | 'duplicates'
  | 'requires_context_from'
  | 'must_merge_before'
  | 'conflicts_with'
  | 'reviewed_by'
  | 'verifies'

export interface Epic {
  epic_id: string
  workspace_id: string
  project_id: string
  display_id: string
  title: string
  description: string | null
  status: EpicStatus
  status_category: StatusCategory
  priority: Priority
  milestone_id: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface Issue {
  issue_id: string
  workspace_id: string
  project_id: string
  epic_id: string | null
  parent_issue_id: string | null
  display_id: string
  title: string
  description: string | null
  status: IssueStatus
  status_category: StatusCategory
  priority: Priority
  assignee_agent_id: string | null
  estimate_type: EstimateType | null
  estimate_value: number | null
  labels: string[]
  version: number
  created_at: string
  updated_at: string
}

export interface PRD {
  prd_id: string
  workspace_id: string
  project_id: string
  display_id: string
  title: string
  description: string | null
  status: PRDStatus
  status_category: StatusCategory
  file_path: string | null
  linked_epic_id: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface Plan {
  plan_id: string
  workspace_id: string
  project_id: string
  display_id: string
  title: string
  description: string | null
  status: PlanStatus
  status_category: StatusCategory
  prd_id: string | null
  file_path: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface TaskRelation {
  task_id: string
  target_task_id: string
  relation_type: TaskRelationType
  created_at: string
}

// --- Input types ---

export interface CreateEpicInput {
  workspace_id: string
  project_id: string
  title: string
  description?: string
  priority?: Priority
  milestone_id?: string
}

export interface UpdateEpicInput {
  epic_id: string
  workspace_id: string
  title?: string
  description?: string
  status?: EpicStatus
  priority?: Priority
  expected_version: number
}

export interface ListEpicsInput {
  workspace_id: string
  project_id?: string
  status?: EpicStatus
  status_category?: StatusCategory
}

export interface CreateIssueInput {
  workspace_id: string
  project_id: string
  epic_id?: string
  parent_issue_id?: string
  title: string
  description?: string
  priority?: Priority
  assignee_agent_id?: string
  estimate_type?: EstimateType
  estimate_value?: number
}

export interface UpdateIssueInput {
  issue_id: string
  workspace_id: string
  title?: string
  description?: string
  status?: IssueStatus
  priority?: Priority
  assignee_agent_id?: string
  estimate_type?: EstimateType
  estimate_value?: number
  labels?: string[]
  expected_version: number
}

export interface ListIssuesInput {
  workspace_id: string
  project_id?: string
  epic_id?: string
  parent_issue_id?: string
  status?: IssueStatus
  status_category?: StatusCategory
  assignee_agent_id?: string
}

export interface CreatePRDInput {
  workspace_id: string
  project_id: string
  title: string
  description?: string
  linked_epic_id?: string
  file_path?: string
}

export interface UpdatePRDInput {
  prd_id: string
  workspace_id: string
  title?: string
  description?: string
  status?: PRDStatus
  file_path?: string
  linked_epic_id?: string
  expected_version: number
}

export interface ListPRDsInput {
  workspace_id: string
  project_id?: string
  status?: PRDStatus
  status_category?: StatusCategory
}

export interface CreatePlanInput {
  workspace_id: string
  project_id: string
  title: string
  description?: string
  prd_id?: string
  file_path?: string
}

export interface UpdatePlanInput {
  plan_id: string
  workspace_id: string
  title?: string
  description?: string
  status?: PlanStatus
  file_path?: string
  prd_id?: string
  expected_version: number
}

export interface ListPlansInput {
  workspace_id: string
  project_id?: string
  status?: PlanStatus
  status_category?: StatusCategory
}

export interface LinkIssueToPlanInput {
  plan_id: string
  issue_id: string
  workspace_id: string
}

export interface AddTaskRelationInput {
  task_id: string
  target_task_id: string
  relation_type: TaskRelationType
}

export interface RemoveTaskRelationInput {
  task_id: string
  target_task_id: string
  relation_type: TaskRelationType
}

export interface GetTaskRelationsInput {
  task_id: string
}

// --- Review types ---

export type ReviewStatus = 'pending' | 'changes_requested' | 'approved' | 'rejected'
export type ReviewTargetType = 'task' | 'artifact' | 'worktree'

export interface Review {
  review_id: string
  workspace_id: string
  project_id: string
  display_id: string
  status: ReviewStatus
  target_type: ReviewTargetType
  target_id: string
  reviewer_agent_id?: string
  summary?: string
  file_path?: string
  created_at: string
  updated_at: string
}

export interface CreateReviewInput {
  workspace_id: string
  project_id: string
  target_type: ReviewTargetType
  target_id: string
  reviewer_agent_id?: string
  summary?: string
  file_path?: string
}

export interface UpdateReviewInput {
  review_id: string
  workspace_id: string
  status: ReviewStatus
  summary?: string
}
