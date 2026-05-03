import type { AgentProfile } from "../agents/types.ts";

export interface AgentRunWorktreeRequest {
  readonly cwd?: string;
  readonly branch?: string;
  readonly copyToWorktree?: string[];
}

export interface AgentRunRequest {
  readonly runId?: string;
  readonly worktree: AgentRunWorktreeRequest;
  readonly agentProfile: AgentProfile;
  readonly prompt: string;
  readonly contextBundle: unknown;
  readonly timeout: number;
  readonly opts?: {
    readonly maxIterations?: number;
    readonly env?: Record<string, string>;
  };
}

export interface AgentRunArtifact {
  readonly id: string;
  readonly path: string;
  readonly kind?: string;
}

export interface AgentRunResult {
  readonly transcript: string;
  readonly exitCode: number;
  readonly filesChanged: string[];
  readonly artifacts: AgentRunArtifact[];
  readonly durationMs: number;
  readonly iterationCount: number;
  readonly tokenUsed?: number;
}
