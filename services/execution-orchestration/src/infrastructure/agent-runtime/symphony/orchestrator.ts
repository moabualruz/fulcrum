/**
 * Symphony orchestrator — state machine operations.
 *
 * Implements the Unclaimed → Claimed transition with optimistic locking.
 * The agent_runs_claimed_unique partial index (task_id WHERE orchestration_state='claimed')
 * is the only synchronization primitive — no advisory locks needed.
 *
 * C6: No raw SQL; TypeORM repository calls only.
 * C7: TypeORM EntityManager operations.
 *
 * Pillar 3, slice 06 — callable from the orchestrator poll loop (wired in slice 10).
 */

import { QueryFailedError } from "typeorm";
import type { EntityManager } from "typeorm";

import {
  claimRunState,
  OrchestrationStateMutationConflict,
} from "@execution-orchestration/application/orchestration/commands.ts";
import {
  dispatchLifecycleHook,
  type DispatchLifecycleHookOptions,
  type LifecycleHookContext,
  type LifecycleHooks,
  type LifecycleHookTimeoutConfig,
} from "./hooks.ts";
import type { WorkflowConfig } from "./schemas.ts";
import {
  startStallScanner,
  type StallScannerHandle,
  type StartStallScannerOptions,
} from "./stall.ts";

export { scanForStalledRuns, startStallScanner } from "./stall.ts";

export class ClaimConflictError extends Error {
  readonly taskId: string;

  constructor(taskId: string) {
    super(`Task ${taskId} is already claimed or has no unclaimed run`);
    this.name = "ClaimConflictError";
    this.taskId = taskId;
  }
}

export interface ClaimRunResult {
  runId: string;
}

export type AgentDispatch<T> = (ctx: LifecycleHookContext) => Promise<T>;

const claimQueues = new Map<string, Promise<void>>();

export interface SymphonyOrchestratorHandle {
  stop: () => void;
}

export interface StartSymphonyOrchestratorOptions extends StartStallScannerOptions {
  startStallScanner?: (
    em: EntityManager,
    orgId: string,
    config: WorkflowConfig,
    opts?: StartStallScannerOptions,
  ) => StallScannerHandle;
}

export function startSymphonyOrchestrator(
  em: EntityManager,
  orgId: string,
  config: WorkflowConfig,
  opts: StartSymphonyOrchestratorOptions = {},
): SymphonyOrchestratorHandle {
  const {
    startStallScanner: startScanner = startStallScanner,
    ...scannerOpts
  } = opts;
  const stallScanner = startScanner(em, orgId, config, scannerOpts);

  return {
    stop: () => {
      stallScanner.stop();
    },
  };
}

/**
 * Atomically transitions an unclaimed AgentRun to claimed state.
 *
 * Selects one unclaimed run, then performs a CAS update by run id and state.
 * The agent_runs_claimed_unique partial index remains the DB-level guard.
 */
export async function claimRun(
  em: EntityManager,
  orgId: string,
  taskId: string,
  instanceId: string,
): Promise<ClaimRunResult> {
  return queueClaim(`${orgId}:${taskId}`, () =>
    claimRunUnlocked(em, orgId, taskId, instanceId),
  );
}

async function claimRunUnlocked(
  em: EntityManager,
  orgId: string,
  taskId: string,
  instanceId: string,
): Promise<ClaimRunResult> {
  try {
    return await claimRunState(em, orgId, taskId, instanceId);
  } catch (error) {
    if (isClaimConflict(error)) throw new ClaimConflictError(taskId);
    throw error;
  }
}

export async function dispatchRunWithHooks<T>(
  em: EntityManager,
  ctx: LifecycleHookContext,
  dispatch: AgentDispatch<T>,
  hooks: LifecycleHooks = {},
  timeoutConfig: LifecycleHookTimeoutConfig = {},
  hookOptions: DispatchLifecycleHookOptions = {},
): Promise<T> {
  await dispatchLifecycleHook(
    em,
    "before_run",
    ctx,
    hooks,
    timeoutConfig,
    hookOptions,
  );

  try {
    const result = await dispatch(ctx);
    await dispatchLifecycleHook(em, "after_run", ctx, hooks, timeoutConfig);
    return result;
  } catch (error) {
    await dispatchLifecycleHook(
      em,
      isCancelError(error) ? "on_cancel" : "on_failure",
      ctx,
      hooks,
      timeoutConfig,
    );
    throw error;
  }
}

function isClaimConflict(error: unknown): boolean {
  if (error instanceof ClaimConflictError) return true;
  if (error instanceof OrchestrationStateMutationConflict) return true;
  if (error instanceof QueryFailedError && (error as QueryFailedError & { code?: string }).code === "23505") return true;

  const message = String((error as { message?: unknown }).message ?? error);
  return message.includes("agent_runs_claimed_unique");
}

function isCancelError(error: unknown): boolean {
  const maybeError = error as { name?: unknown; code?: unknown };
  return maybeError.name === "AbortError" || maybeError.code === "ABORT_ERR";
}

async function queueClaim<T>(key: string, claim: () => Promise<T>): Promise<T> {
  const previous = claimQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => gate);
  claimQueues.set(key, queued);

  await previous.catch(() => undefined);
  try {
    return await claim();
  } finally {
    release();
    if (claimQueues.get(key) === queued) {
      claimQueues.delete(key);
    }
  }
}
