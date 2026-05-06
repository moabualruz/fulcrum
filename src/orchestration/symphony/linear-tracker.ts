/**
 * Linear-backed Symphony tracker adapter.
 *
 * INGEST-ONLY in Phase 3 (D-04): Linear is a task ingestion/update path
 * only. Symphony dispatch uses the native Fulcrum tracker exclusively.
 * External dispatch-capable adapter parity is deferred to a future version (D-05).
 *
 * Gated behind FULCRUM_FEATURES=connector-linear (C1/C2).
 * Wraps LinearConnector to implement TrackerAdapter interface.
 * Bidirectional sync: Linear issues → CandidateIssue shape (ingest-only);
 * Fulcrum task state changes → Linear issue state updates.
 * Conflict strategy: last-write-wins with updatedAt comparison.
 *
 * Pillar 3, slice 21.
 */

import { LinearConnector, type LinearConnectorOptions } from "../../connectors/linear.ts";
import type { SyncItem, SyncResult } from "../../connectors/interface.ts";
import {
  CandidateIssueListSchema,
  READY_TASK_STATUS,
  type AgentRunIssue,
  type AgentRunOrchestrationState,
  type CandidateIssue,
  type IssueState,
} from "./schemas.ts";
import type { TrackerAdapter } from "./tracker-adapter.ts";

// ---------------------------------------------------------------------------
// Feature gate
// ---------------------------------------------------------------------------

function isConnectorLinearEnabled(): boolean {
  const features = (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((f) => f.trim());
  return features.includes("connector-linear");
}

function hasLinearApiKey(): boolean {
  return typeof process.env["LINEAR_API_KEY"] === "string" &&
    process.env["LINEAR_API_KEY"].length > 0;
}

// ---------------------------------------------------------------------------
// Conflict resolution
// ---------------------------------------------------------------------------

export interface ConflictRecord {
  localState: string;
  remoteState: string;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  winner: "local" | "remote";
  resolvedAt: string;
}

export interface ConflictResult {
  winner: "local" | "remote";
  conflict: ConflictRecord;
}

export function resolveConflict(
  local: { updatedAt: string; state: string },
  remote: { updatedAt: string; state: string },
): ConflictResult {
  const localTime = new Date(local.updatedAt).getTime();
  const remoteTime = new Date(remote.updatedAt).getTime();
  const winner = remoteTime >= localTime ? "remote" : "local";

  return {
    winner,
    conflict: {
      localState: local.state,
      remoteState: remote.state,
      localUpdatedAt: local.updatedAt,
      remoteUpdatedAt: remote.updatedAt,
      winner,
      resolvedAt: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Linear state mapping
// ---------------------------------------------------------------------------

const LINEAR_CANDIDATE_STATE_TYPES = new Set([
  "unstarted",
  "backlog",
  "triage",
]);

function isLinearCandidateState(stateType?: string): boolean {
  if (!stateType) return true; // default to candidate if unknown
  return LINEAR_CANDIDATE_STATE_TYPES.has(stateType);
}

function mapLinearStatusToFulcrum(stateType?: string): string {
  if (stateType === "completed") return "done";
  if (stateType === "started") return "in-progress";
  if (stateType === "cancelled" || stateType === "canceled") return "cancelled";
  return "todo";
}

function fulcrumStateToLinearStateName(state: string): string {
  if (state === "done") return "Done";
  if (state === "in-progress") return "In Progress";
  return "Todo";
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export interface LinearTrackerAdapterOptions {
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
}

export interface PushStateChangeInput {
  externalId: string;
  newState: string;
}

export interface LinearTrackerAdapterWithSync extends TrackerAdapter {
  sync(orgId: string): Promise<SyncResult>;
  pushStateChange(orgId: string, input: PushStateChangeInput): Promise<SyncResult>;
}

class LinearTrackerAdapterImpl implements LinearTrackerAdapterWithSync {
  readonly kind = "linear";
  private readonly connector: LinearConnector;

  constructor(options: LinearTrackerAdapterOptions = {}) {
    const connectorOptions: LinearConnectorOptions = {};
    if (options.fetch) {
      connectorOptions.fetch = options.fetch;
    }
    this.connector = new LinearConnector(connectorOptions);
    this.connector.enable();
  }

  async fetchCandidateIssues(orgId: string, limit = 50): Promise<CandidateIssue[]> {
    await this.connector.connect();
    const syncResult = await this.connector.pull();

    if (syncResult.errors.length > 0) return [];

    const items = this.connector.pulledItems;
    const candidates = items
      .filter((item) => isLinearCandidateState(item.data.stateType as string | undefined))
      .slice(0, limit)
      .map((item) => mapSyncItemToCandidateIssue(item));

    return CandidateIssueListSchema.parse(candidates);
  }

  async fetchIssuesByStates(
    _orgId: string,
    states: readonly AgentRunOrchestrationState[],
    _limit = 50,
  ): Promise<AgentRunIssue[]> {
    if (states.length === 0) return [];
    // Linear connector doesn't track AgentRun states directly.
    // Returns empty — the Fulcrum-native tracker handles run state queries.
    return [];
  }

  async fetchIssueStatesByIds(
    _orgId: string,
    runIds: readonly string[],
  ): Promise<IssueState[]> {
    if (runIds.length === 0) return [];
    // Linear connector doesn't track AgentRun states directly.
    return [];
  }

  async sync(orgId: string): Promise<SyncResult> {
    await this.connector.connect();
    return this.connector.pull();
  }

  async pushStateChange(_orgId: string, input: PushStateChangeInput): Promise<SyncResult> {
    await this.connector.connect();
    return this.connector.push([{
      externalId: input.externalId,
      data: {
        status: input.newState,
      },
    }]);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates Linear tracker adapter if feature gate is satisfied.
 * Returns null when connector-linear flag is off or API key missing.
 */
export function createLinearTrackerAdapter(
  options: LinearTrackerAdapterOptions = {},
): LinearTrackerAdapterWithSync | null {
  if (!isConnectorLinearEnabled()) return null;
  if (!hasLinearApiKey()) return null;
  return new LinearTrackerAdapterImpl(options);
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapSyncItemToCandidateIssue(item: SyncItem): CandidateIssue {
  const id = deterministicUuid(item.externalId);

  return {
    id,
    identifier: item.externalId,
    title: (item.data.title as string) ?? item.externalId,
    state: READY_TASK_STATUS,
    status: READY_TASK_STATUS,
    priority: typeof item.data.estimate === "number" ? item.data.estimate : null,
    createdAt: new Date(),
    blockedByIds: [],
    workflowId: null,
  };
}

/**
 * Deterministic UUID v4-like id from a string seed.
 * Not cryptographically secure — used only for stable mapping.
 */
function deterministicUuid(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(0, 3)}-${hex.padEnd(12, "0").slice(0, 12)}`;
}
