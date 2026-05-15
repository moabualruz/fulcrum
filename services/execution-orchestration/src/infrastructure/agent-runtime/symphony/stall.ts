import type { EntityManager } from "typeorm";
import { LessThan } from "typeorm";

import type { AgentRun } from "@execution-orchestration/infrastructure/database/entities/orchestration/AgentRun.ts";
import type { WorkflowConfig } from "./schemas.ts";
import {
  scheduleRetry,
  type RetryClockOptions,
  type RetryError,
  type RunRef,
} from "./retry.ts";

export type StalledRunHandler = (
  em: EntityManager,
  run: RunRef,
  error: RetryError,
  config: WorkflowConfig,
  opts?: RetryClockOptions,
) => Promise<void>;

export interface StallScanOptions extends RetryClockOptions {}

export interface StallScannerHandle {
  stop: () => void;
}

export interface StartStallScannerOptions extends StallScanOptions {
  intervalMs?: number;
  scanTimeoutMs?: number;
  scan?: typeof scanForStalledRuns;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (timer: unknown) => void;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (timer: unknown) => void;
  onError?: (error: unknown) => void;
}

export class StallScanTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Symphony stall scanner timed out after ${timeoutMs}ms`);
    this.name = "StallScanTimeoutError";
  }
}

export async function scanForStalledRuns(
  em: EntityManager,
  orgId: string,
  config: WorkflowConfig,
  onStalled: StalledRunHandler = scheduleRetry,
  opts: StallScanOptions = {},
): Promise<number> {
  const { AgentRun } = await import(
    "@execution-orchestration/infrastructure/database/entities/orchestration/AgentRun.ts"
  );
  const now = opts.now?.() ?? new Date();
  const cutoff = new Date(now.getTime() - config.stallTimeoutMs);
  // DB-level filter on startedAt (preserves index usage + existing test contract).
  // This is the broad net: all runs whose startedAt predates the cutoff.
  const runs = await em.find(AgentRun, {
    where: { org: { id: orgId }, orchestrationState: "running", startedAt: LessThan(cutoff) } as never,
  });

  // In-process refinement for lastCodexTimestamp (SYM-19):
  // If lastCodexTimestamp is set and is more recent than the cutoff,
  // the run has had recent Codex activity and is NOT stalled.
  const stalledRuns = (runs as AgentRun[]).filter((run) => {
    const lastCodex = (run as AgentRun & { lastCodexTimestamp?: Date }).lastCodexTimestamp;
    if (lastCodex && lastCodex >= cutoff) {
      // Run has recent Codex activity — not stalled
      return false;
    }
    return true;
  });

  for (const run of stalledRuns) {
    await onStalled(
      em,
      toRunRef(run as AgentRun, orgId),
      { kind: "stall_timeout" },
      config,
      opts,
    );
  }

  return stalledRuns.length;
}

export function startStallScanner(
  em: EntityManager,
  orgId: string,
  config: WorkflowConfig,
  opts: StartStallScannerOptions = {},
): StallScannerHandle {
  const intervalMs = opts.intervalMs ?? 30_000;
  const scanTimeoutMs = opts.scanTimeoutMs ?? intervalMs;
  const scan = opts.scan ?? scanForStalledRuns;
  const setTimer = opts.setInterval ??
    ((fn: () => void, ms: number) => globalThis.setInterval(fn, ms));
  const clearTimer = opts.clearInterval ??
    ((timer: unknown) =>
      globalThis.clearInterval(
        timer as ReturnType<typeof globalThis.setInterval>,
      ));
  const setScanTimeout = opts.setTimeout ??
    ((fn: () => void, ms: number) => globalThis.setTimeout(fn, ms));
  const clearScanTimeout = opts.clearTimeout ??
    ((timer: unknown) =>
      globalThis.clearTimeout(
        timer as ReturnType<typeof globalThis.setTimeout>,
      ));
  const onError = opts.onError ?? defaultScannerErrorHandler;
  let inFlightId: number | null = null;
  let scanSeq = 0;

  const tick = () => {
    if (inFlightId !== null) return;

    const scanId = ++scanSeq;
    inFlightId = scanId;
    const timeout = scanTimeoutMs > 0
      ? setScanTimeout(() => {
          if (inFlightId !== scanId) return;
          inFlightId = null;
          reportScannerError(onError, new StallScanTimeoutError(scanTimeoutMs));
        }, scanTimeoutMs)
      : null;

    scan(em, orgId, config, scheduleRetry, { now: opts.now })
      .catch((error) => {
        reportScannerError(onError, error);
      })
      .finally(() => {
        if (inFlightId !== scanId) return;
        inFlightId = null;
        if (timeout !== null) clearScanTimeout(timeout);
      });
  };

  const timer = setTimer(tick, intervalMs);
  return {
    stop: () => {
      clearTimer(timer);
    },
  };
}

function defaultScannerErrorHandler(error: unknown): void {
  console.error("fulcrum symphony stall scanner failed", error);
}

function reportScannerError(
  onError: (error: unknown) => void,
  error: unknown,
): void {
  try {
    onError(error);
  } catch (handlerError) {
    defaultScannerErrorHandler(handlerError);
  }
}

function toRunRef(run: AgentRun, fallbackOrgId: string): RunRef {
  return {
    id: run.id,
    orgId: run.org?.id ?? fallbackOrgId,
    attemptCount: run.attemptCount,
    orchestrationState: "running",
  };
}
