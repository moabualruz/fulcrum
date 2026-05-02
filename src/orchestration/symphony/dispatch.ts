/**
 * Symphony dispatch loop — tick() function.
 *
 * Pillar 3, slice 11. Implements the main orchestration cycle:
 *   fetchCandidates → claim → workspace → prompt → hooks → runner → reconcile
 *
 * All IO is injected via TickDeps for testability. OTel spans emitted per
 * state transition. Feature-gated behind FULCRUM_FEATURES (C1).
 */

import type { CandidateIssue, WorkflowConfig } from "./schemas.ts";

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
  emitSpan: (name: string, attributes: Record<string, unknown>) => void;
  countRunningRuns: (orgId: string) => Promise<number>;
}

// ---------------------------------------------------------------------------
// tick()
// ---------------------------------------------------------------------------

export async function tick(deps: TickDeps): Promise<TickResult> {
  const result: TickResult = { claimed: 0, succeeded: 0, failed: 0, skippedCapacity: false };

  // Check capacity
  const currentRunning = await deps.countRunningRuns(deps.orgId);
  if (currentRunning >= deps.maxConcurrency) {
    result.skippedCapacity = true;
    return result;
  }

  const availableSlots = deps.maxConcurrency - currentRunning;
  const candidates = await deps.fetchCandidateIssues(deps.orgId, availableSlots);
  if (candidates.length === 0) return result;

  for (const candidate of candidates.slice(0, availableSlots)) {
    try {
      await processCandidate(deps, candidate, result);
    } catch {
      // Individual candidate failures don't abort the loop
      result.failed += 1;
    }
  }

  return result;
}

async function processCandidate(
  deps: TickDeps,
  candidate: CandidateIssue,
  result: TickResult,
): Promise<void> {
  // Claim
  const { runId } = await deps.claimRun(deps.orgId, candidate.id, deps.instanceId);
  await deps.transitionState(runId, "unclaimed", "claimed");
  deps.emitSpan("symphony.claim", { org_id: deps.orgId, run_id: runId, from_state: "unclaimed", to_state: "claimed" });
  result.claimed += 1;

  // Transition to running
  await deps.transitionState(runId, "claimed", "running");
  deps.emitSpan("symphony.run", { org_id: deps.orgId, run_id: runId, from_state: "claimed", to_state: "running" });

  const run = await deps.getRunEntity(runId);
  const workspacePath = await deps.createWorkspace(run);
  const prompt = await deps.renderPrompt(run);

  // Hooks + dispatch
  await deps.dispatchHook("before_run", { run, workspacePath, prompt });

  try {
    const runnerResult = await deps.dispatchToRunner(prompt, workspacePath);

    await deps.dispatchHook("after_run", { run, workspacePath, result: runnerResult });

    // Transition to succeeded/released
    const finalState = runnerResult.success ? "succeeded" : "failed";
    await deps.transitionState(runId, "running", finalState);
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
    deps.emitSpan("symphony.release", { org_id: deps.orgId, run_id: runId, from_state: "running", to_state: "failed" });

    if (!deps.config.keepOnFailure) {
      await deps.destroyWorkspace(run);
    }

    throw error;
  }
}
