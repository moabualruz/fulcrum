/**
 * Symphony dispatch loop — tick() function.
 *
 * Pillar 3, slice 11. Implements the main orchestration cycle in explicit order:
 *   reconcile -> validate -> fetch -> sort -> dispatch -> notify
 *
 * All IO is injected via TickDeps for testability. OTel spans emitted per
 * state transition. Feature-gated behind FULCRUM_FEATURES (C1).
 *
 * SYM-07: Poll tick sequence — reconcileRunningIssues -> validateRuntimeConfig ->
 *         fetchAndSortCandidates -> dispatchCandidate -> notifyStateChange
 * SYM-12: Terminal reconciliation stops session and cleans workspace.
 * SYM-13: Non-active reconciliation stops session without workspace cleanup.
 * SYM-17: Active reconciliation updates snapshot.
 */

import type { EntityManager } from "typeorm";

import type { CandidateIssue, WorkflowConfig } from "./schemas.ts";
import {
  initTracer,
  traceTransition,
  type TracerLike,
} from "./telemetry.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunnerResult {
  success: boolean;
  output?: string;
}

export interface TickResult {
  claimed: number;
  succeeded: number;
  failed: number;
  skippedCapacity: boolean;
}

export interface ReconcileOptions {
  stopSession?: (runId: string) => Promise<void>;
  cleanWorkspace?: (runId: string) => Promise<void>;
  updateSnapshot?: (runId: string) => Promise<void>;
}

export interface TickDeps {
  orgId: string;
  instanceId: string;
  maxConcurrency: number;
  config: WorkflowConfig;

  fetchCandidateIssues: (orgId: string, limit: number) => Promise<CandidateIssue[]>;
  claimRun: (orgId: string, taskId: string, instanceId: string) => Promise<{ runId: string }>;
  getRunEntity: (runId: string) => Promise<unknown>;
  createWorkspace: (run: unknown) => Promise<string>;
  renderPrompt: (run: unknown) => Promise<string>;
  dispatchToRunner: (prompt: string, workspacePath: string) => Promise<RunnerResult>;
  destroyWorkspace: (run: unknown) => Promise<void>;
  transitionState: (runId: string, from: string, to: string) => Promise<void>;
  dispatchHook: (hookName: string, ctx: unknown) => Promise<void>;
  emitSpan: (name: string, attributes?: Record<string, unknown>) => void;
  tracer?: TracerLike;
  countRunningRuns: (orgId: string) => Promise<number>;

  // Optional explicit sequence hooks — allow tests to inject and assert ordering
  reconcileRunningIssues?: (orgId: string) => Promise<void>;
  validateRuntimeConfig?: (orgId: string) => void;
  notifyStateChange?: (orgId: string, runId: string, state: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Exported sequence functions (SYM-07)
// ---------------------------------------------------------------------------

/**
 * reconcileRunningIssues — Part B reconciliation.
 *
 * Called at the start of each tick before candidate fetch.
 * Classifies currently running issues into active/non-active/terminal
 * and applies the correct cleanup disposition:
 * - terminal: stop session + clean workspace (SYM-12)
 * - non-active (e.g. retry_queued): stop session only (SYM-13)
 * - active (claimed/running): refresh snapshot (SYM-17)
 */
export async function reconcileRunningIssues(
  em: EntityManager,
  orgId: string,
  opts: ReconcileOptions = {},
): Promise<void> {
  const { refreshRunningIssues } = await import("./tracker.ts");

  const snapshot = await refreshRunningIssues(em, orgId);

  // Terminal runs: stop session + clean workspace (SYM-12)
  for (const run of snapshot.terminal) {
    if (opts.stopSession) {
      await opts.stopSession(run.id);
    }
    if (run.workspacePath && opts.cleanWorkspace) {
      await opts.cleanWorkspace(run.id);
    }
  }

  // Non-active runs (retry_queued, unclaimed): stop session only (SYM-13)
  for (const run of snapshot.nonActive) {
    if (opts.stopSession) {
      await opts.stopSession(run.id);
    }
    // No workspace cleanup for non-active runs
  }

  // Active runs (claimed, running): refresh snapshot (SYM-17)
  for (const run of snapshot.active) {
    if (opts.updateSnapshot) {
      await opts.updateSnapshot(run.id);
    }
  }
}

/**
 * validateRuntimeConfig — validates that the orchestrator has a valid
 * runtime config before attempting candidate fetch and dispatch.
 * Throws if config is structurally invalid.
 */
type DispatchPreflightConfig = WorkflowConfig & {
  tracker?: {
    kind?: unknown;
    api_key?: unknown;
    project_slug?: unknown;
  };
  codex?: {
    command?: unknown;
  };
};

function hasRuntimePreflightSections(config: DispatchPreflightConfig): boolean {
  return config.tracker !== undefined || config.codex !== undefined;
}

export function validateRuntimeConfig(config: DispatchPreflightConfig): void {
  if (!config || typeof config !== "object") {
    throw new Error("validateRuntimeConfig: config must be a non-null object");
  }
  if (typeof config.stallTimeoutMs !== "number" || config.stallTimeoutMs <= 0) {
    throw new Error("validateRuntimeConfig: stallTimeoutMs must be a positive number");
  }
  if (typeof config.maxRetryBackoffMs !== "number" || config.maxRetryBackoffMs <= 0) {
    throw new Error("validateRuntimeConfig: maxRetryBackoffMs must be a positive number");
  }
  if (typeof config.maxAttempts !== "number" || config.maxAttempts < 1) {
    throw new Error("validateRuntimeConfig: maxAttempts must be >= 1");
  }
  if (!hasRuntimePreflightSections(config)) return;

  const tracker = config.tracker;
  if (!tracker || typeof tracker.kind !== "string" || tracker.kind.trim() === "") {
    throw new Error("validateRuntimeConfig: tracker.kind must be present");
  }
  if (tracker.kind !== "linear") {
    throw new Error(`validateRuntimeConfig: tracker.kind unsupported: ${tracker.kind}`);
  }
  if (typeof tracker.api_key !== "string" || tracker.api_key.trim() === "") {
    throw new Error("validateRuntimeConfig: tracker.api_key must be present");
  }
  if (typeof tracker.project_slug !== "string" || tracker.project_slug.trim() === "") {
    throw new Error("validateRuntimeConfig: tracker.project_slug must be present for linear");
  }

  const codex = config.codex;
  if (!codex || typeof codex.command !== "string" || codex.command.trim() === "") {
    throw new Error("validateRuntimeConfig: codex.command must be present");
  }
}

// ---------------------------------------------------------------------------
// tick()
// ---------------------------------------------------------------------------

export async function tick(deps: TickDeps): Promise<TickResult> {
  const result: TickResult = { claimed: 0, succeeded: 0, failed: 0, skippedCapacity: false };

  // --- 1. Reconcile running issues (SYM-07 sequence step 1) ---
  if (deps.reconcileRunningIssues) {
    await deps.reconcileRunningIssues(deps.orgId);
  }

  // --- 2. Validate runtime config (SYM-07 sequence step 2) ---
  if (deps.validateRuntimeConfig) {
    deps.validateRuntimeConfig(deps.orgId);
  } else {
    validateRuntimeConfig(deps.config);
  }

  // --- 3. Check capacity before fetch (SYM-07 sequence step 3) ---
  const currentRunning = await deps.countRunningRuns(deps.orgId);
  if (currentRunning >= deps.maxConcurrency) {
    result.skippedCapacity = true;
    return result;
  }

  const availableSlots = deps.maxConcurrency - currentRunning;

  // --- 4. Fetch and sort candidates (SYM-07 sequence step 4) ---
  const candidates = await deps.fetchCandidateIssues(deps.orgId, availableSlots);
  if (candidates.length === 0) return result;

  // --- 5. Dispatch candidates (SYM-07 sequence step 5) ---
  for (const candidate of candidates.slice(0, availableSlots)) {
    try {
      await processCandidate(deps, candidate, result);
    } catch {
      // Individual candidate failures don't abort the loop
      result.failed += 1;
    }
  }

  // --- 6. Notify state change (SYM-07 sequence step 6) ---
  if (deps.notifyStateChange) {
    await deps.notifyStateChange(deps.orgId, "", "dispatched");
  }

  return result;
}

async function processCandidate(
  deps: TickDeps,
  candidate: CandidateIssue,
  result: TickResult,
): Promise<void> {
  const tracer = deps.tracer ?? initTracer("fulcrum");

  // Claim
  const { runId } = await deps.claimRun(deps.orgId, candidate.id, deps.instanceId);
  const run = await deps.getRunEntity(runId);
  const attemptCount = attemptCountOf(run);
  await deps.transitionState(runId, "unclaimed", "claimed");
  traceTransition(tracer, "unclaimed", "claimed", {
    org_id: deps.orgId,
    run_id: runId,
    attempt_count: attemptCount,
  });
  deps.emitSpan("symphony.claim", { org_id: deps.orgId, run_id: runId, from_state: "unclaimed", to_state: "claimed" });
  result.claimed += 1;

  // Transition to running
  await deps.transitionState(runId, "claimed", "running");
  traceTransition(tracer, "claimed", "running", {
    org_id: deps.orgId,
    run_id: runId,
    attempt_count: attemptCount,
  });
  deps.emitSpan("symphony.run", { org_id: deps.orgId, run_id: runId, from_state: "claimed", to_state: "running" });

  const workspacePath = await deps.createWorkspace(run);

  // SYM-13: after_create fires on new workspace creation
  await deps.dispatchHook("after_create", { run, workspacePath });

  const prompt = await deps.renderPrompt(run);
  await deps.dispatchHook("before_run", { run, workspacePath, prompt });

  try {
    const runnerResult = await deps.dispatchToRunner(prompt, workspacePath);

    await deps.dispatchHook("after_run", { run, workspacePath, result: runnerResult });

    // Transition to succeeded/released
    const finalState = runnerResult.success ? "succeeded" : "failed";
    await deps.transitionState(runId, "running", finalState);
    traceTransition(tracer, "running", finalState, {
      org_id: deps.orgId,
      run_id: runId,
      attempt_count: attemptCount,
    });
    deps.emitSpan("symphony.release", { org_id: deps.orgId, run_id: runId, from_state: "running", to_state: finalState });

    if (runnerResult.success) {
      result.succeeded += 1;
      await deps.destroyWorkspace(run);
    } else {
      result.failed += 1;
      if (!deps.config.keepOnFailure) {
        await deps.destroyWorkspace(run);
      }
    }
  } catch (error) {
    await deps.dispatchHook("on_failure", { run, workspacePath, error });

    await deps.transitionState(runId, "running", "failed");
    traceTransition(tracer, "running", "failed", {
      org_id: deps.orgId,
      run_id: runId,
      attempt_count: attemptCount,
    });
    deps.emitSpan("symphony.release", { org_id: deps.orgId, run_id: runId, from_state: "running", to_state: "failed" });

    if (!deps.config.keepOnFailure) {
      await deps.destroyWorkspace(run);
    }

    throw error;
  }
}

function attemptCountOf(run: unknown): number {
  const attemptCount = (run as { attemptCount?: unknown }).attemptCount;
  return typeof attemptCount === "number" ? attemptCount : 0;
}
