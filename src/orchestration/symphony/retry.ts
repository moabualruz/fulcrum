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
  const nextRetryAt = new Date(
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
        orchestrationState: "retry_queued",
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
      payload: { from: run.orchestrationState, to: "retry_queued" },
      createdAt: now,
    });

    await tx.flush();
  });
}
