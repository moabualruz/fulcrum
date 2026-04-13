/**
 * PI Agent OS MCP Tool Types
 *
 * Type definitions for all 13 pi-os MCP tools, for use in PI's TypeScript
 * runtime when calling lifecycle and control-plane tools directly.
 *
 * Tool names follow the MCP namespace pattern: mcp__pi-os__<name>
 *
 * Usage in PI runtime (conceptual):
 *   const result = await mcp.call<StartAgentRunResult>(
 *     "mcp__pi-os__start_agent_run", { task_id, agent_role, workspace_id }
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
  project_id: string;
  workspace_id: string;
  /** Filter by status: "queued" | "in_progress" | "completed" | "blocked" */
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
  project_id: string;
  workspace_id: string;
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
  /** New status: "queued" | "in_progress" | "completed" | "blocked" */
  status?: string;
  /** Appended to task's blocker list */
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
  project_id?: string;
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
  [key: string]: unknown;
}

export type ListAgentProfilesResult = AgentProfile[] | McpError[];

export interface GetAgentRunStatusInput {
  run_id: string;
}

export interface AgentRunStatus {
  run_id: string;
  status: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Lifecycle tools — PI runtime calls these, not the LLM
// ---------------------------------------------------------------------------

export interface StartAgentRunInput {
  task_id: string;
  agent_role: string;
  workspace_id: string;
  project_id?: string;
  /** Absolute path of the git worktree PI allocated for this run */
  worktree_path?: string;
  /**
   * Optional: PI can supply its own run ID (e.g. an existing internal run ID).
   * If omitted, pi-os generates one with a "run_" prefix.
   */
  pi_run_id?: string;
}

export interface StartAgentRunResult {
  run_id: string;
  status: "running";
}

export interface HeartbeatAgentRunInput {
  run_id: string;
  workspace_id: string;
  /** Human-readable description of what the agent is currently doing */
  current_step?: string;
  /** 0–100 */
  progress_pct?: number;
}

export interface HeartbeatAgentRunResult {
  run_id: string;
  ok: boolean;
}

export interface CompleteAgentRunInput {
  run_id: string;
  workspace_id: string;
  /** One-paragraph summary of what was done */
  output_summary?: string;
  /** Comma-separated list of file paths produced, e.g. "src/auth.py,tests/test_auth.py" */
  artifact_paths?: string;
}

export interface CompleteAgentRunResult {
  run_id: string;
  status: "completed";
}

export interface BlockAgentRunInput {
  run_id: string;
  workspace_id: string;
  /** Why the agent cannot proceed. Stored as a blocker for the Chief of Staff. */
  reason: string;
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
  goal: string;
  project_id: string;
  workspace_id: string;
  max_tasks?: number;
  max_events?: number;
}

export interface BuildCosContextResult {
  /** Markdown string — prepend to the CoS agent's system prompt */
  context_markdown: string;
  project_id: string;
  workspace_id: string;
}

export interface GetWorkspaceStatusInput {
  workspace_id: string;
}

export interface ActiveRunSummary {
  run_id: string;
  role: string;
  status: string;
  task_id: string | null;
}

export interface BlockerSummary {
  run_id: string;
  reason: string;
}

export interface GetWorkspaceStatusResult {
  workspace_id: string;
  active_runs: number;
  blocked_runs: number;
  merge_queue_depth: number;
  wip_count: number;
  runs: ActiveRunSummary[];
  blockers: BlockerSummary[];
}

// ---------------------------------------------------------------------------
// Convenience: tool name → input/output type mapping
// ---------------------------------------------------------------------------

export interface PiOsToolMap {
  "mcp__pi-os__list_tasks": [ListTasksInput, ListTasksResult];
  "mcp__pi-os__create_task": [CreateTaskInput, CreateTaskResult];
  "mcp__pi-os__update_task": [UpdateTaskInput, UpdateTaskResult];
  "mcp__pi-os__recall_memory": [RecallMemoryInput, RecallMemoryResult];
  "mcp__pi-os__write_memory": [WriteMemoryInput, WriteMemoryResult];
  "mcp__pi-os__list_agent_profiles": [Record<never, never>, ListAgentProfilesResult];
  "mcp__pi-os__get_agent_run_status": [GetAgentRunStatusInput, AgentRunStatus];
  "mcp__pi-os__start_agent_run": [StartAgentRunInput, StartAgentRunResult];
  "mcp__pi-os__heartbeat_agent_run": [HeartbeatAgentRunInput, HeartbeatAgentRunResult];
  "mcp__pi-os__complete_agent_run": [CompleteAgentRunInput, CompleteAgentRunResult];
  "mcp__pi-os__block_agent_run": [BlockAgentRunInput, BlockAgentRunResult];
  "mcp__pi-os__build_cos_context": [BuildCosContextInput, BuildCosContextResult];
  "mcp__pi-os__get_workspace_status": [GetWorkspaceStatusInput, GetWorkspaceStatusResult];
}
