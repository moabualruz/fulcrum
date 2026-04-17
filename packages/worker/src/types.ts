// packages/worker/src/types.ts
// Types for the pluggable agent worker layer (H-2).
//
// An `AgentAdapter` is a tiny contract that knows how to execute a
// subordinate agent given a `SpawnContext`, emit heartbeats during the run,
// and return a terminal `WorkerResult`. The lifecycle driver in
// `lifecycle.ts` is the thing that actually persists runs to the DB —
// adapters never touch `fulcrum-agent-core` directly.

import type { AgentRole, HandoffPacket } from 'fulcrum-agent-core'

/**
 * Context handed to an adapter's `spawn()` method. Everything the adapter
 * needs to kick off a subordinate agent plus a `heartbeat` callback that
 * writes progress to the agent_runs row.
 */
export interface SpawnContext {
  run_id: string
  workspace_id: string
  project_id: string
  task_id: string
  role: AgentRole
  model: string | null
  handoff: HandoffPacket | null
  worktree_path: string | null
  /**
   * Progress callback — adapters call this to emit a heartbeat that
   * updates `agent_runs.current_step`/`progress_pct`/`heartbeat_at`
   * and appends a `heartbeat` event to `agent_runs.events`.
   */
  heartbeat: (current_step: string, progress_pct?: number) => Promise<void>
}

/**
 * Terminal result returned by an adapter. The lifecycle driver turns
 * `completed` into `completeAgentRun()` and `blocked` into
 * `blockAgentRun()`.
 */
export interface WorkerResult {
  status: 'completed' | 'blocked'
  summary?: string
  artifact_paths?: string[]
  tests_passed?: number
  tests_failed?: number
  error?: string
}

/**
 * The adapter contract. Named so the registry can look it up and so
 * `listAgentAdapters()` can surface installed adapters.
 */
export interface AgentAdapter {
  name: string
  spawn(ctx: SpawnContext): Promise<WorkerResult>
}

/**
 * Public input to `spawnAgent()`. The caller provides the policy role
 * (`caller_role`), the target role for the subordinate (`target_role`),
 * and the task to attach the run to. `adapter` defaults to
 * `FULCRUM_AGENT_ADAPTER` env var or `'stub'`.
 */
export interface SpawnAgentInput {
  workspace_id: string
  project_id: string
  task_id: string
  caller_role: AgentRole
  target_role: AgentRole
  handoff?: HandoffPacket
  worktree_path?: string
  model?: string
  adapter?: string
}
