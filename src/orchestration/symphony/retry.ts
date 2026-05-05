import type { EntityManager } from "@mikro-orm/postgresql";

import type { AgentRunOrchestrationState, WorkflowConfig } from "./schemas.ts";

export interface RunRef {
  id: string;
  orgId: string;
  attemptCount: number;
  orchestrationState: AgentRunOrchestrationState;
}

export interface RetryError {
  kind: string;
}

export interface RetryClockOptions {
  now?: () => Date;
}

export function calcRetryDelay(attempt: number, maxMs: number): number {
  const normalizedAttempt = Math.max(1, Math.trunc(attempt));
  const uncapped = 10_000 * (2 ** (normalizedAttempt - 1));
  return Math.min(uncapped, maxMs);
}

/**
 * scheduleContinuationRetry — schedules a retry after normal worker exit (SYM-10).
 *
 * Uses a fixed 1000ms delay (not exponential), distinct from failure retry.
 * The 1000ms delay lets the orchestrator re-check tracker state before
 * redispatching the same run on the same thread.
 */
export async function scheduleContinuationRetry(
  em: EntityManager,
  run: RunRef,
  config: WorkflowConfig,
  opts: RetryClockOptions = {},
): Promise<void> {
  const [{ AgentRun }, { Event }, { Org }] = await Promise.all([
    import("../../db/entities/orchestration/AgentRun.ts"),
    import("../../db/entities/core/Event.ts"),
    import("../../db/entities/auth/Org.ts"),
  ]);

  const CONTINUATION_DELAY_MS = 1_000;
  const now = opts.now?.() ?? new Date();
  const nextRetryAt = new Date(now.getTime() + CONTINUATION_DELAY_MS);
  const nextAttempt = run.attemptCount + 1;
  const exhausted = nextAttempt >= config.maxAttempts;
  const nextState = exhausted ? "failed" : "retry_queued";
  const fork = em.fork();

  await fork.transactional(async (tx) => {
    const agentRunRepo = tx.getRepository(AgentRun);
    const eventsRepo = tx.getRepository(Event);
    const org = tx.getReference(Org, run.orgId);

    const updatedCount = await agentRunRepo.nativeUpdate(
      {
        id: run.id,
        org: run.orgId,
        orchestrationState: run.orchestrationState,
      } as never,
      {
        orchestrationState: nextState,
        ...(exhausted ? { status: "failed" } : {}),
        attemptCount: nextAttempt,
        nextRetryAt: exhausted ? null : nextRetryAt,
        lastErrorKind: "continuation",
      } as never,
    );

    if (updatedCount === 0) return;

    eventsRepo.create({
      org,
      subjectKind: "agent_run",
      subjectId: run.id,
      verb: "state_changed",
      payload: { from: run.orchestrationState, to: nextState, kind: "continuation" },
      createdAt: now,
    });

    await tx.flush();
  });
}

export async function scheduleRetry(
  em: EntityManager,
  run: RunRef,
  error: RetryError,
  config: WorkflowConfig,
  opts: RetryClockOptions = {},
): Promise<void> {
  const [{ AgentRun }, { Event }, { Org }] = await Promise.all([
    import("../../db/entities/orchestration/AgentRun.ts"),
    import("../../db/entities/core/Event.ts"),
    import("../../db/entities/auth/Org.ts"),
  ]);

  const now = opts.now?.() ?? new Date();
  const nextAttempt = run.attemptCount + 1;
  const exhausted = nextAttempt >= config.maxAttempts;
  const nextState = exhausted ? "failed" : "retry_queued";
  const nextRetryAt = exhausted
    ? null
    : new Date(
        now.getTime() + calcRetryDelay(nextAttempt, config.maxRetryBackoffMs),
      );
  const fork = em.fork();

  await fork.transactional(async (tx) => {
    const agentRunRepo = tx.getRepository(AgentRun);
    const eventsRepo = tx.getRepository(Event);
    const org = tx.getReference(Org, run.orgId);

    const updatedCount = await agentRunRepo.nativeUpdate(
      {
        id: run.id,
        org: run.orgId,
        orchestrationState: run.orchestrationState,
      } as never,
      {
        orchestrationState: nextState,
        ...(exhausted ? { status: "failed" } : {}),
        attemptCount: nextAttempt,
        nextRetryAt,
        lastErrorKind: error.kind,
      } as never,
    );

    if (updatedCount === 0) return;

    eventsRepo.create({
      org,
      subjectKind: "agent_run",
      subjectId: run.id,
      verb: "state_changed",
      payload: { from: run.orchestrationState, to: nextState },
      createdAt: now,
    });

    await tx.flush();
  });
}
