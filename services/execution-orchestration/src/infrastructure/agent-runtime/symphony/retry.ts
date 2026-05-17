import type { EntityManager } from "typeorm";

import { transitionRunForRetry } from "@execution-orchestration/application/orchestration/commands.ts";
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
  const CONTINUATION_DELAY_MS = 1_000;
  const now = opts.now?.() ?? new Date();
  const nextRetryAt = new Date(now.getTime() + CONTINUATION_DELAY_MS);
  const nextAttempt = run.attemptCount + 1;
  const exhausted = nextAttempt >= config.maxAttempts;
  const nextState = exhausted ? "failed" : "retry_queued";
  await transitionRunForRetry(em, run, {
    nextState,
    nextAttempt,
    nextRetryAt: exhausted ? null : nextRetryAt,
    lastErrorKind: "continuation",
    exhausted,
    now,
  });
}

export async function scheduleRetry(
  em: EntityManager,
  run: RunRef,
  error: RetryError,
  config: WorkflowConfig,
  opts: RetryClockOptions = {},
): Promise<void> {
  const now = opts.now?.() ?? new Date();
  const nextAttempt = run.attemptCount + 1;
  const exhausted = nextAttempt >= config.maxAttempts;
  const nextState = exhausted ? "failed" : "retry_queued";
  const nextRetryAt = exhausted
    ? null
    : new Date(
        now.getTime() + calcRetryDelay(nextAttempt, config.maxRetryBackoffMs),
      );
  await transitionRunForRetry(em, run, {
    nextState,
    nextAttempt,
    nextRetryAt,
    lastErrorKind: error.kind,
    exhausted,
    now,
  });
}
