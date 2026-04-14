export type TaskStatus =
  | 'queued' | 'ready' | 'claimed' | 'running'
  | 'blocked' | 'failed' | 'completed' | 'cancelled'

export type AgentRunStatus =
  | 'created' | 'starting' | 'running' | 'waiting'
  | 'blocked' | 'failed' | 'finished' | 'aborted'

export type StatusCategory = 'backlog' | 'active' | 'blocked' | 'done'

export type WorkspaceStatus = 'active' | 'archived'
export type ProjectStatus = 'active' | 'archived' | 'paused'
export type ProjectType = 'git' | 'non_git' | 'submodule' | 'logical'
export type WriteMode = 'worktree' | 'in_place' | 'sequential'

export type AgentRole =
  | 'chief_of_staff'
  | 'context_gatherer'
  | 'prd_planner'
  | 'implementation_planner'
  | 'issue_decomposer'
  | 'software_engineer'
  | 'research_worker'
  | 'refactor_worker'
  | 'browser_worker'
  | 'data_engineer'
  | 'ml_engineer'
  | 'devops_engineer'
  | 'architecture_reviewer'
  | 'code_reviewer'
  | 'qa_engineer'
  | 'security_reviewer'
  | 'integration_worker'
  | 'documentation_writer'
  | 'memory_curator'
  | 'tech_lead'
  | 'product_manager'
  | 'analyst'
  | 'orchestrator'
  | 'custom'

export type TaskRelationType =
  | 'blocks' | 'blocked_by' | 'follows' | 'preceded_by'
  | 'relates' | 'duplicates' | 'requires_context_from'
  | 'must_merge_before' | 'conflicts_with' | 'reviewed_by' | 'verifies'

export type MemoryScope = 'global' | 'project' | 'file' | 'task'

export type MemoryKind =
  | 'fact' | 'summary' | 'symbol' | 'decision' | 'procedure'
  | 'error' | 'diff' | 'doc' | 'code' | 'task_goal'
  | 'task_decision' | 'task_failure' | 'task_outcome'

export type ArtifactType =
  | 'prd' | 'plan' | 'issue_breakdown' | 'context_gathering_report'
  | 'patch' | 'changed_files_manifest' | 'command_log' | 'test_report'
  | 'benchmark_report' | 'review_report' | 'integration_report'
  | 'merge_conflict_report' | 'risk_report' | 'research_note'
  | 'source_digest' | 'comparison_matrix' | 'memory_promotion_summary'
  | 'task_outcome_summary'

export type EventType =
  | 'project_registered' | 'epic_created' | 'issue_created' | 'task_created'
  | 'task_status_changed' | 'team_created' | 'team_invoked'
  | 'agent_run_created' | 'agent_run_started' | 'agent_run_progress'
  | 'agent_run_blocked' | 'agent_run_failed' | 'agent_run_finished'
  | 'handoff_created' | 'handoff_consumed' | 'artifact_written'
  | 'artifact_validated' | 'memory_written' | 'memory_recalled'
  | 'worktree_allocated' | 'merge_queued' | 'merge_started'
  | 'merge_conflicted' | 'merge_completed' | 'review_created' | 'review_updated'
  | 'validation_started' | 'validation_finished' | 'policy_denied'
  | 'hook_executed' | 'workflow_step_completed'

// Keep RunStatus as alias for backward compat with existing code
export type RunStatus = AgentRunStatus

export interface Task {
  task_id: string
  workspace_id: string
  project_id: string
  issue_id: string | null
  display_id: string
  title: string
  description: string | null
  status: TaskStatus
  status_category: StatusCategory
  priority: 'critical' | 'high' | 'medium' | 'low' | 'none'
  estimate_type: 'story_points' | 'hours' | null
  estimate_value: number | null
  depends_on: string[]
  assigned_to: string | null
  note: string | null
  done_criteria: string | null
  version: number
  created_at: string
  updated_at: string
  claimed_at: string | null
  completed_at: string | null
  assigned_run_id: string | null
  labels: string[]
  blockers: string[]
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
  project_id: string
  display_id: string
  agent_id: string
  role: AgentRole
  pi_profile: string | null
  status: AgentRunStatus
  status_category: StatusCategory
  current_step: string | null
  current_path: string | null
  progress_pct: number
  output_summary: string | null
  artifacts: RunArtifacts | null
  git_branch: string | null
  git_commit: string | null
  heartbeat_at: string | null
  blocker: string | null
  worktree_id: string | null
  version: number
  started_at: string
  updated_at: string
  finished_at: string | null
}

export interface Memory {
  memory_id: string
  scope: MemoryScope
  kind: MemoryKind
  workspace_id: string
  project_id: string | null
  file_path: string | null
  symbol_path: string | null
  title: string
  summary: string
  content: string
  canonical_text: string | null
  tags: string[]
  entities: string[]
  confidence: number
  freshness: number
  importance: number
  access_count: number
  event_time: string | null
  content_hash: string | null
  task_id: string | null
  issue_id: string | null
  artifact_id: string | null
  provenance_refs: string[]
  embedding: Buffer | null
  created_at: string
  updated_at: string
  last_accessed_at: string
}

export interface FulcrumEvent {
  evt_id: string
  workspace_id: string
  project_id: string | null
  evt_type: EventType
  ts: string
  object_type: string | null
  object_id: string | null
  actor_type: string
  actor_id: string
  payload: Record<string, unknown>
  severity: 'debug' | 'info' | 'warn' | 'error'
  trace_id: string | null
  span_id: string | null
  correlation_id: string | null
}

export interface TaskRelation {
  task_id: string
  target_task_id: string
  relation_type: TaskRelationType
  created_at: string
}

export interface AgentProfile {
  role: AgentRole
  description: string
  can_create_teams: boolean
  can_dispatch_agents: boolean
}

export interface WorkspaceStatusResult {
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

export interface VaultConfig {
  path?: string         // default: ~/.fulcrum/vault
  l2_enabled?: boolean  // default: false
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
  vault?: VaultConfig
}

export interface PolicyCheckResult {
  allowed: boolean
  reason?: 'wip_limit_exceeded' | 'dependencies_incomplete'
  current_wip?: number
  limit?: number
  blocking_tasks?: string[]
}

export type HandoffPriority = 'critical' | 'high' | 'normal' | 'low'
export type HandoffScope = 'task' | 'issue' | 'project' | 'workspace'
/**
 * HandoffMode — mirrors the Python enum in pi-agent-os.
 * - sync:     caller blocks while the receiver runs
 * - async:    fire-and-forget; receiver runs independently
 * - review:   receiver is a reviewer gate
 * - escalate: handoff raises the decision to a higher authority
 */
export type HandoffMode = 'sync' | 'async' | 'review' | 'escalate'

export interface HandoffPacket {
  handoff_id: string
  workspace_id: string
  project_id?: string
  task_id?: string
  issue_id?: string
  from_agent_id?: string
  to_agent_id?: string
  goal: string
  task_type: string
  priority: HandoffPriority
  scope: HandoffScope
  inputs: Record<string, unknown>
  constraints?: string[]
  done_criteria: string[]
  artifact_contract_id?: string
  handoff_mode: HandoffMode
  status: 'pending' | 'claimed' | 'completed' | 'cancelled'
  claimed_at?: string
  created_at: string
}

export interface CreateHandoffInput {
  workspace_id: string
  project_id?: string
  task_id?: string
  issue_id?: string
  from_agent_id?: string
  to_agent_id?: string
  goal: string
  task_type: string
  priority?: HandoffPriority
  scope?: HandoffScope
  inputs?: Record<string, unknown>
  constraints?: string[]
  done_criteria?: string[]
  artifact_contract_id?: string
  handoff_mode?: HandoffMode
}

/**
 * TaskPacket — structured work specification passed to an agent.
 * Fulcrum creates this; Pi's executor consumes it.
 */
export interface TaskPacket {
  goal: string                        // what the agent must achieve
  task_type: string                   // e.g. 'implement', 'review', 'research', 'plan'
  inputs?: Record<string, unknown>    // structured inputs (files, context, etc.)
  constraints?: string[]              // hard constraints the agent must respect
  done_criteria?: string              // how to know the task is complete
  artifact_contract_id?: string       // which artifacts must be produced
}

/**
 * SpawnableRun — everything Pi needs to spawn an agent for a given run.
 * Returned from buildSpawnableRun; consumed by @pi/executor.
 */
export interface SpawnableRun {
  run_id: string
  workspace_id: string
  role: AgentRole
  pi_profile: string          // e.g. 'claude-cli/claude-opus-4-5', 'gemini-cli/gemini-pro'
  task_packet: TaskPacket
}

/**
 * StartAgentRunInput — public input type for startAgentRun.
 */
export interface StartAgentRunInput {
  task_id: string
  workspace_id: string
  role: AgentRole
  agent_id?: string
  pi_profile?: string
  task_packet?: TaskPacket
  git_branch?: string
}

export interface Workspace {
  workspace_id: string
  name: string
  status: WorkspaceStatus
  config_path?: string  // path to workspace/project config file
  created_at: string
}

export interface ArtifactContract {
  contract_id: string
  workspace_id: string
  task_id?: string
  workflow_id?: string
  required_artifacts: ArtifactType[]
  optional_artifacts?: ArtifactType[]
  final_summary_artifact?: ArtifactType
  review_inputs?: ArtifactType[]
  merge_readiness_rules?: string[]
  created_at: string
}

export class FulcrumError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'not_found'
      | 'version_conflict'
      | 'policy_blocked'
      | 'invalid_input'
      | 'invalid_state'
      | 'rate_limited'
  ) {
    super(message)
    this.name = 'FulcrumError'
  }
}
