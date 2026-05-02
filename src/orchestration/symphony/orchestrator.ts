/**
 * Symphony orchestrator — state machine operations.
 *
 * Implements the Unclaimed → Claimed transition with optimistic locking.
 * The agent_runs_claimed_unique partial index (task_id WHERE orchestration_state='claimed')
 * is the only synchronization primitive — no advisory locks needed.
 *
 * C6: No raw SQL — MikroORM nativeUpdate + repository calls only.
 * C7: MikroORM v7 EntityManager operations.
 *
 * Pillar 3, slice 06 — callable from the orchestrator poll loop (wired in slice 10).
 */

import { UniqueConstraintViolationException } from "@mikro-orm/core";
import type { EntityManager } from "@mikro-orm/postgresql";

import type { AgentRunRepository } from "../../db/repositories/orchestration/AgentRunRepository.ts";
import type { EventRepository } from "../../db/repositories/core/EventRepository.ts";
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
  const [{ AgentRun }, { Event }, { Org }] = await Promise.all([
    import("../../db/entities/orchestration/AgentRun.ts"),
    import("../../db/entities/core/Event.ts"),
    import("../../db/entities/auth/Org.ts"),
  ]);

  const fork = em.fork();

  try {
    return await fork.transactional(async (tx) => {
      const agentRunRepo = tx.getRepository(AgentRun) as AgentRunRepository;
      const eventsRepo = tx.getRepository(Event) as EventRepository;
      const org = tx.getReference(Org, orgId);

      const candidate = await agentRunRepo.findOne(
        {
          org: orgId,
          task: taskId,
          orchestrationState: "unclaimed",
        } as never,
        { orderBy: { createdAt: "ASC", id: "ASC" }, fields: ["id"] },
      );

      if (!candidate) {
        throw new ClaimConflictError(taskId);
      }

      const updatedCount = await agentRunRepo.nativeUpdate(
        {
          id: candidate.id,
          orchestrationState: "unclaimed",
        } as never,
        {
          orchestrationState: "claimed",
          claimedBy: instanceId,
        } as never,
      );

      if (updatedCount === 0) {
        throw new ClaimConflictError(taskId);
      }

      eventsRepo.create({
        org,
        subjectKind: "agent_run",
        subjectId: candidate.id,
        verb: "state_changed",
        payload: { from: "unclaimed", to: "claimed" },
        createdAt: new Date(),
      });

      await tx.flush();

      return { runId: candidate.id };
    });
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
  if (error instanceof UniqueConstraintViolationException) return true;

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
