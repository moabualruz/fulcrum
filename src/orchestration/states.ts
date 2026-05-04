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
