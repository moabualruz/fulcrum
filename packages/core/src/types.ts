export type TaskStatus = 'queued' | 'in_progress' | 'completed' | 'blocked'
export type RunStatus = 'running' | 'completed' | 'blocked' | 'stale' | 'escalated'
export type AgentRole =
  | 'chief_of_staff'
  | 'implementer'
  | 'tester'
  | 'reviewer'
  | 'researcher'
  | 'planner'

export interface Task {
  task_id: string
  workspace_id: string
  project_id: string
  title: string
  description: string | null
  status: TaskStatus
  depends_on: string[]
  assigned_to: string | null
  note: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface RunArtifacts {
  files_changed?: string[]
  tests_passed?: number
  tests_failed?: number
  pr_url?: string
  notes?: string[]
}

export interface AgentRun {
  run_id: string
  task_id: string
  workspace_id: string
  role: AgentRole
  status: RunStatus
  current_step: string | null
  progress_pct: number
  output_summary: string | null
  artifacts: RunArtifacts | null
  git_branch: string | null
  git_commit: string | null
  version: number
  started_at: string
  updated_at: string
  completed_at: string | null
}

export interface Memory {
  memory_id: string
  workspace_id: string
  project_id: string
  content: string
  tags: string[]
  confidence: number
  created_at: string
  updated_at: string
  last_accessed_at: string
  access_count: number
}

export interface AgentProfile {
  role: AgentRole
  description: string
  can_create_teams: boolean
  can_dispatch_agents: boolean
}

export interface WorkspaceStatus {
  workspace_id: string
  running_runs: AgentRun[]
  blocked_runs: AgentRun[]
  stale_runs: AgentRun[]
  wip_count: number
  queued_tasks: number
  completed_tasks_today: number
}

export interface PolicyConfig {
  wip_limit: number
  wip_limit_per_role: Partial<Record<AgentRole, number>>
  heartbeat_timeout_minutes: number
  escalation_timeout_minutes: number
}

export interface EmbeddingProviderConfig {
  provider: 'local' | 'openai' | 'voyage' | 'cohere' | 'ollama' | 'jina' | 'custom'
  model: string
  apiKey?: string
  baseUrl?: string
  dimensions?: number
}

export interface FulcrumConfig {
  workspace_id: string
  project_id: string
  port: number
  embedding: {
    text: EmbeddingProviderConfig
    code: EmbeddingProviderConfig | null
  }
  reranker: EmbeddingProviderConfig
  policy: PolicyConfig
}

export interface PolicyCheckResult {
  allowed: boolean
  reason?: string
  current_wip?: number
  limit?: number
  blocking_tasks?: string[]
}

export class FulcrumError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'not_found'
      | 'version_conflict'
      | 'policy_blocked'
      | 'invalid_input'
  ) {
    super(message)
    this.name = 'FulcrumError'
  }
}
