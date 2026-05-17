/**
 * Shared tracker-adapter interface for Symphony orchestration.
 *
 * Both `tracker.ts` (Fulcrum-native) and `linear-tracker.ts` (Linear connector)
 * implement this contract. The dispatch loop calls whichever adapter is active.
 */

import type {
  AgentRunIssue,
  AgentRunOrchestrationState,
  CandidateIssue,
  IssueState,
} from "./schemas.ts";

export interface TrackerAdapter {
  readonly kind: string;

  fetchCandidateIssues(orgId: string, limit?: number): Promise<CandidateIssue[]>;

  fetchIssuesByStates(
    orgId: string,
    states: readonly AgentRunOrchestrationState[],
    limit?: number,
  ): Promise<AgentRunIssue[]>;

  fetchIssueStatesByIds(
    orgId: string,
    runIds: readonly string[],
  ): Promise<IssueState[]>;
}
