import type { AgentRunOrchestrationState } from "../../db/entities/orchestration/AgentRun.ts";

export interface AppContext {
  orgId: string;
  userId: string | null;
  projectId?: string | null;
}

export interface RunDto {
  id: string;
  orgId: string;
  projectId: string | null;
  agentName: string | null;
  status: string | null;
  prompt: string | null;
  createdAt: Date;
}

export interface RunDetailDto extends RunDto {
  projectId: string | null;
  model: string | null;
  parentRunId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  transcriptPath: string | null;
  workspaceDiffPath: string | null;
  orchestrationState: AgentRunOrchestrationState | null;
  workspacePath: string | null;
  renderedPrompt: string | null;
  attemptCount: number;
  nextRetryAt: Date | null;
  lastErrorKind: string | null;
  observability: RunObservabilityDto;
}

export interface RunObservabilityDto {
  context: {
    sourceRefs: Array<{
      kind: "task" | "doc" | "memory" | "run" | "artifact";
      id: string;
      reason: string;
      scope: "project" | "global";
    }>;
    warnings: string[];
    scope: { projectId: string | null; taskId: string | null; includeGlobal: boolean };
  };
  artifacts: Array<{
    id: string;
    filename: string;
    path: string | null;
    mime: string | null;
    lifecycleState: string;
    createdAt: string;
  }>;
  memoryCandidates: Array<Record<string, unknown>>;
  followUpTasks: Array<Record<string, unknown>>;
  audit: Array<{
    id: string;
    verb: string;
    actor: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
  recovery: {
    retryable: boolean;
    retryCount: number;
    nextRetryAt: Date | null;
    lastErrorKind: string | null;
  };
}

export interface DispatchRunInput {
  agentName: string;
  prompt?: string | null;
}
