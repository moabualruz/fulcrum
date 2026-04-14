/**
 * Fulcrum MCP Tool Types
 *
 * Type definitions for all 13 Fulcrum MCP tools, for use in PI's TypeScript
 * runtime when calling lifecycle and control-plane tools directly.
 *
 * Tool names follow the MCP namespace pattern: mcp__fulcrum__<name>
 *
 * Usage in PI runtime (conceptual):
 *   const result = await mcp.call<StartAgentRunResult>(
 *     "mcp__fulcrum__start_agent_run", { task_id, agent_role, workspace_id }
 *   );
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export interface McpError {
  error: string;
}

// ---------------------------------------------------------------------------
// Task tools
// ---------------------------------------------------------------------------

export interface ListTasksInput {
  workspace_id: string;
  project_id?: string;
  /** Filter by status: "open" | "in_progress" | "done" | "blocked" */
  status?: string;
  limit?: number;
}

export interface TaskSummary {
  task_id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigned_to: string;
  blockers: string[];
  done_criteria: string;
}

export type ListTasksResult = TaskSummary[] | McpError[];

export interface CreateTaskInput {
  title: string;
  workspace_id: string;
  project_id?: string;
  description?: string;
  /** "low" | "medium" | "high" | "critical" */
  priority?: string;
  assigned_to?: string;
  done_criteria?: string;
}

export interface CreateTaskResult {
  task_id: string;
  title: string;
  status: string;
  priority: string;
  assigned_to: string;
}

export interface UpdateTaskInput {
  task_id: string;
  /** New status: "open" | "in_progress" | "done" | "blocked" */
  status?: string;
  /** Progress note or blocker description */
  note?: string;
  assigned_to?: string;
}

export interface UpdateTaskResult {
  task_id: string;
  updated: boolean;
  changes: string[];
}

// ---------------------------------------------------------------------------
// Memory tools
// ---------------------------------------------------------------------------

export interface RecallMemoryInput {
  query: string;
  workspace_id: string;
  project_id: string;
  limit?: number;
}

export interface MemoryEntry {
  content: string;
  score: number;
  tags: string[];
}

export type RecallMemoryResult = MemoryEntry[] | McpError[];

export interface WriteMemoryInput {
  content: string;
  workspace_id: string;
  project_id: string;
  title?: string;
  /** Comma-separated tag list, e.g. "decision,architecture" */
  tags?: string;
  importance?: number;
}

export interface WriteMemoryResult {
  saved: boolean;
  memory_id: string;
  project_id: string;
  tags: string[];
}

// ---------------------------------------------------------------------------
// Agent profile tools
// ---------------------------------------------------------------------------

export interface AgentProfile {
  profile_id: string;
  role?: string;
  description?: string;
  [key: string]: unknown;
}

export type ListAgentProfilesResult = AgentProfile[] | McpError[];

export interface GetAgentRunStatusInput {
  run_id: string;
}

export interface AgentRunStatus {
  run_id: string;
  status: string;
  agent_role: string;
  task_id: string | null;
  workspace_id: string;
  started_at: string;
  heartbeat_at?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Lifecycle tools — PI runtime calls these, not the LLM
// ---------------------------------------------------------------------------

export interface StartAgentRunInput {
  workspace_id: string;
  agent_role: string;
  task_id?: string;
  project_id?: string;
  /** Absolute path of the git worktree PI allocated for this run */
  worktree_path?: string;
  /**
   * Optional: PI can supply its own run ID (e.g. an existing internal run ID).
   * If omitted, Fulcrum generates one with a "run_" prefix.
   */
  pi_run_id?: string;
  model?: string;
  provider?: string;
}

export interface StartAgentRunResult {
  run_id: string;
  status: "running";
}

export interface HeartbeatAgentRunInput {
  run_id: string;
  /** Human-readable description of what the agent is currently doing */
  status?: string;
}

export interface HeartbeatAgentRunResult {
  run_id: string;
  ok: boolean;
}

export interface CompleteAgentRunInput {
  run_id: string;
  /** One-paragraph summary of what was done */
  summary?: string;
  /** Array of file paths produced */
  artifact_paths?: string[];
  tests_passed?: number;
  tests_failed?: number;
  pr_url?: string;
}

export interface CompleteAgentRunResult {
  run_id: string;
  status: "completed";
}

export interface BlockAgentRunInput {
  run_id: string;
  /** Why the agent cannot proceed. Stored as a blocker for the Chief of Staff. */
  reason: string;
  escalation_reason?: string;
}

export interface BlockAgentRunResult {
  run_id: string;
  status: "blocked";
  reason: string;
}

// ---------------------------------------------------------------------------
// CoS context + workspace status
// ---------------------------------------------------------------------------

export interface BuildCosContextInput {
  workspace_id: string;
  project_id: string;
  max_tokens?: number;
}

export interface BuildCosContextResult {
  /** Markdown string — prepend to the CoS agent's system prompt */
  context_markdown: string;
  workspace_id: string;
  project_id: string;
}

export interface GetWorkspaceStatusInput {
  workspace_id: string;
}

export interface ActiveRunSummary {
  run_id: string;
  agent_role: string;
  status: string;
  task_id: string | null;
}

export interface BlockerSummary {
  run_id: string;
  agent_role: string;
  reason: string;
}

export interface GetWorkspaceStatusResult {
  workspace_id: string;
  active_runs: number;
  blocked_runs: number;
  wip_count: number;
  runs: ActiveRunSummary[];
  blockers: BlockerSummary[];
}

// ---------------------------------------------------------------------------
// Convenience: tool name → input/output type mapping
// ---------------------------------------------------------------------------

export interface FulcrumToolMap {
  "mcp__fulcrum__list_tasks":          [ListTasksInput, ListTasksResult];
  "mcp__fulcrum__create_task":         [CreateTaskInput, CreateTaskResult];
  "mcp__fulcrum__update_task":         [UpdateTaskInput, UpdateTaskResult];
  "mcp__fulcrum__recall_memory":       [RecallMemoryInput, RecallMemoryResult];
  "mcp__fulcrum__write_memory":        [WriteMemoryInput, WriteMemoryResult];
  "mcp__fulcrum__list_agent_profiles": [Record<never, never>, ListAgentProfilesResult];
  "mcp__fulcrum__get_agent_run_status":[GetAgentRunStatusInput, AgentRunStatus];
  "mcp__fulcrum__start_agent_run":     [StartAgentRunInput, StartAgentRunResult];
  "mcp__fulcrum__heartbeat_agent_run": [HeartbeatAgentRunInput, HeartbeatAgentRunResult];
  "mcp__fulcrum__complete_agent_run":  [CompleteAgentRunInput, CompleteAgentRunResult];
  "mcp__fulcrum__block_agent_run":     [BlockAgentRunInput, BlockAgentRunResult];
  "mcp__fulcrum__build_cos_context":   [BuildCosContextInput, BuildCosContextResult];
  "mcp__fulcrum__get_workspace_status":[GetWorkspaceStatusInput, GetWorkspaceStatusResult];
}
