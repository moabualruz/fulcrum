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

export interface DispatchRunInput {
  agentName: string;
  prompt?: string | null;
}
