import { z } from "zod";

import { AGENT_RUN_ORCHESTRATION_STATES } from "../states.ts";

export { AGENT_RUN_ORCHESTRATION_STATES } from "../states.ts";
export type { AgentRunOrchestrationState } from "../states.ts";

export const READY_TASK_STATUS = "ready";

export const FulcrumUuidSchema = z.string().regex(
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
);

export const AgentRunOrchestrationStateSchema = z.enum(
  AGENT_RUN_ORCHESTRATION_STATES,
);

export const FetchCandidateIssuesInputSchema = z.object({
  orgId: FulcrumUuidSchema,
  limit: z.number().int().min(1).max(500).default(50),
});

export const CandidateIssueSchema = z.object({
  id: FulcrumUuidSchema,
  identifier: z.string(),
  title: z.string(),
  state: z.string(),
  status: z.literal(READY_TASK_STATUS),
  priority: z.number().int().nullable(),
  createdAt: z.date(),
  blockedByIds: z.array(FulcrumUuidSchema),
  workflowId: FulcrumUuidSchema.nullable(),
});

export const CandidateIssueListSchema = z.array(CandidateIssueSchema);

export type CandidateIssue = z.infer<typeof CandidateIssueSchema>;

export const FetchIssuesByStatesInputSchema = z.object({
  orgId: FulcrumUuidSchema,
  states: z.array(AgentRunOrchestrationStateSchema).max(50),
  limit: z.number().int().min(1).max(500).default(50),
});

export const FetchIssueStatesByIdsInputSchema = z.object({
  orgId: FulcrumUuidSchema,
  runIds: z.array(FulcrumUuidSchema).max(500),
});

export const TrackerTaskSchema = z.object({
  id: FulcrumUuidSchema,
  status: z.string().nullable(),
  priority: z.number().int().nullable(),
  createdAt: z.date(),
  blockedByIds: z.array(FulcrumUuidSchema),
  workflowId: FulcrumUuidSchema.nullable(),
});

export type TrackerTask = z.infer<typeof TrackerTaskSchema>;

export const AgentRunIssueSchema = z.object({
  id: FulcrumUuidSchema,
  state: AgentRunOrchestrationStateSchema,
  orchestrationState: AgentRunOrchestrationStateSchema,
  task: TrackerTaskSchema.nullable(),
  startedAt: z.date(),
  attemptCount: z.number().int(),
  nextRetryAt: z.date().nullable(),
  workspacePath: z.string().nullable(),
  lastErrorKind: z.string().nullable(),
});

export const AgentRunIssueListSchema = z.array(AgentRunIssueSchema);

export type AgentRunIssue = z.infer<typeof AgentRunIssueSchema>;

export const IssueStateSchema = z.object({
  id: FulcrumUuidSchema,
  state: AgentRunOrchestrationStateSchema,
});

export const IssueStateListSchema = z.array(IssueStateSchema);

export type IssueState = z.infer<typeof IssueStateSchema>;

export const GetWorkspacePathInputSchema = z.object({
  orgId: FulcrumUuidSchema,
  runId: FulcrumUuidSchema,
});

export const WorkspacePathSchema = z.object({
  runId: FulcrumUuidSchema,
  workspacePath: z.string().nullable(),
});

export type WorkspacePath = z.infer<typeof WorkspacePathSchema>;

export const WorkflowConfigSchema = z.object({
  stallTimeoutMs: z.number().int().positive().default(300_000),
  maxRetryBackoffMs: z.number().int().positive().default(300_000),
  keepOnFailure: z.boolean().default(false),
  maxAttempts: z.number().int().positive().default(3),
});

export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;

// ---------------------------------------------------------------------------
// Symphony strict 12-field Issue model (SYM-05, SYM-06)
// ---------------------------------------------------------------------------

/**
 * Full blocker reference — must include id, identifier, and state.
 * Unresolved blockers (IDs that cannot be found in org scope) must
 * throw TrackerBlockerResolutionError before this schema is reached.
 */
export const BlockedByRefSchema = z.object({
  id: FulcrumUuidSchema,
  identifier: z.string().min(1),
  state: z.string().min(1),
});

export type BlockedByRef = z.infer<typeof BlockedByRefSchema>;

/**
 * Strict Symphony Issue — all 12 fields required.
 * Missing local data becomes explicit null/default where spec allows.
 * Labels are normalized to lowercase at parse time.
 */
export const SymphonyIssueSchema = z.object({
  id: FulcrumUuidSchema,
  identifier: z.string().min(1),
  title: z.string(),
  description: z.string().nullable(),
  branch_name: z.string().nullable(),
  url: z.string().nullable(),
  labels: z.array(z.string()).transform((labels) => labels.map((l) => l.toLowerCase())),
  state: z.string(),
  priority: z.number().int().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
  blocked_by: z.array(BlockedByRefSchema),
});

export type SymphonyIssue = z.infer<typeof SymphonyIssueSchema>;
