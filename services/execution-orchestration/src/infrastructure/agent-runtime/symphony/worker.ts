import type { EntityManager } from "typeorm";

import type { WorkflowConfig } from "./schemas.ts";
import {
  startStallScanner,
  type StallScannerHandle,
  type StartStallScannerOptions,
} from "./stall.ts";

export const SYMPHONY_POLL_TASK = "symphony:poll";
export const SYMPHONY_POLL_CRON = "* * * * *";
export const SYMPHONY_STALL_SCAN_INTERVAL_MS = 30_000;

export interface SymphonyWorkerLike {
  addTask(name: string, handler: () => Promise<void>): void;
  addCronTask?: (name: string, cron: string) => void;
}

export interface SymphonyPollOrchestrator {
  tick: () => Promise<unknown>;
}

export interface SymphonyPollWorkerLifecycle {
  start: () => void;
  stop: () => void;
  readonly registeredTasks: readonly string[];
}

export interface RegisterSymphonyPollWorkerOptions {
  orchestrator: SymphonyPollOrchestrator;
  em: EntityManager;
  orgId: string;
  config: WorkflowConfig;
  startStallScanner?: (
    em: EntityManager,
    orgId: string,
    config: WorkflowConfig,
    opts?: StartStallScannerOptions,
  ) => StallScannerHandle;
}

export function registerSymphonyPollWorker(
  worker: SymphonyWorkerLike,
  options: RegisterSymphonyPollWorkerOptions,
): SymphonyPollWorkerLifecycle {
  worker.addTask(SYMPHONY_POLL_TASK, async () => {
    await options.orchestrator.tick();
  });
  worker.addCronTask?.(SYMPHONY_POLL_TASK, SYMPHONY_POLL_CRON);

  const startScanner = options.startStallScanner ?? startStallScanner;
  let stallScanner: StallScannerHandle | null = null;

  return {
    registeredTasks: [SYMPHONY_POLL_TASK],
    start: () => {
      if (stallScanner) return;
      stallScanner = startScanner(options.em, options.orgId, options.config, {
        intervalMs: SYMPHONY_STALL_SCAN_INTERVAL_MS,
      });
    },
    stop: () => {
      stallScanner?.stop();
      stallScanner = null;
    },
  };
}
