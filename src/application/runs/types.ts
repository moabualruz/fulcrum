export interface AppContext {
  orgId: string;
  userId: string | null;
  projectId?: string | null;
}

export interface RunDto {
  id: string;
  orgId: string;
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
}

export interface DispatchRunInput {
  agentName: string;
  prompt?: string | null;
}
