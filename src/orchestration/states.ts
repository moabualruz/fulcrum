export const AGENT_RUN_ORCHESTRATION_STATES = [
  "unclaimed",
  "claimed",
  "running",
  "retry_queued",
  "released",
  "succeeded",
  "failed",
  "timed_out",
  "stalled",
  "cancelled",
] as const;

export type AgentRunOrchestrationState =
  (typeof AGENT_RUN_ORCHESTRATION_STATES)[number];

/**
 * Run-attempt lifecycle states (SYM-09).
 * Distinct from issue orchestration states — tracks internal progress
 * within a single attempt from workspace creation through terminal exit.
 */
export const ATTEMPT_LIFECYCLE_STATES = [
  "preparing_workspace",
  "building_prompt",
  "launching_agent_process",
  "initializing_session",
  "streaming_turn",
  "finishing",
  "succeeded",
  "failed",
  "timed_out",
  "stalled",
  "cancelled",
] as const;

export type AttemptLifecycleState =
  (typeof ATTEMPT_LIFECYCLE_STATES)[number];
