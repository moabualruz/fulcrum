import type { WorkerPayloadAssertion, WorkerRegistry, WorkerTaskHandler } from "./registry.ts";
import type { RepoSyncLocalRepositories } from "@integration-hub/application/repos/workers/sync-local.ts";
import type {
  RepoSyncRemoteOptions,
  RepoSyncRemoteQueue,
  RepoSyncRemoteRepositories,
} from "@integration-hub/application/repos/workers/sync-remote.ts";
import type { NotificationDeliveryRepositories, NotificationDeliveryWorkerOptions } from "@notification-center/application/delivery-runtime/delivery-worker.ts";

export interface QueueTaskDefinition<TPayload = unknown> {
  name: string;
  assertPayload: WorkerPayloadAssertion<TPayload>;
  handler?: WorkerTaskHandler<TPayload>;
}

export type LocalJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface LocalJob {
  id: string;
  orgId: string;
  projectId?: string | null;
  traceId?: string | null;
  queue: string;
  kind: string;
  payload: Record<string, unknown>;
  status: LocalJobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  lockedBy?: string | null;
  lockedAt?: Date | null;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnqueueLocalJobInput {
  orgId: string;
  projectId?: string | null;
  traceId?: string | null;
  queue: string;
  kind: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  availableAt?: Date;
}

export interface JobQueueStore<THelpers = unknown> {
  enqueue(input: EnqueueLocalJobInput): Promise<LocalJob>;
  claimNext(queue: string, workerId: string, now?: Date): Promise<LocalJob | null>;
  complete(jobId: string): Promise<LocalJob | null>;
  fail(jobId: string, reason: string, options: { retryable: boolean; nextAvailableAt?: Date }): Promise<LocalJob | null>;
  listForMetrics(queue?: string): Promise<LocalJob[]>;
}

export interface WorkerTickInput<THelpers = unknown> {
  queue: string;
  workerId: string;
  store: JobQueueStore<THelpers>;
  registry: WorkerRegistry;
  helpers: THelpers;
  now?: Date;
}

export type WorkerTickResult =
  | { status: "idle"; queue: string; workerId: string }
  | { status: "succeeded"; jobId: string; queue: string; kind: string; traceId?: string | null }
  | { status: "retryable-failed"; jobId: string; queue: string; kind: string; traceId?: string | null; reason: string }
  | { status: "terminal-failed"; jobId: string; queue: string; kind: string; traceId?: string | null; reason: string };

export interface JobQueueMetrics {
  queue: string;
  depth: number;
  running: number;
  succeeded: number;
  failures: number;
  retryableFailures: number;
  terminalFailures: number;
  oldestQueuedLatencyMs: number | null;
}

export interface QueueDefinition<TPayload = unknown> {
  name: string;
  task: QueueTaskDefinition<TPayload>;
}

export interface CronDefinition {
  name: string;
  taskName: string;
  intervalMs: number;
}

export interface RepoWorkerBootstrapDeps {
  registry: WorkerRegistry;
  localRepositories: RepoSyncLocalRepositories;
  remoteRepositories: RepoSyncRemoteRepositories;
  remoteQueue: RepoSyncRemoteQueue;
  remoteOptions?: RepoSyncRemoteOptions;
  registerCron?: (cron: CronDefinition) => void;
}

export interface NotificationWorkerBootstrapDeps {
  registry: WorkerRegistry;
  repositories: NotificationDeliveryRepositories;
  options?: NotificationDeliveryWorkerOptions;
  registerCron?: (cron: CronDefinition) => void;
}

export function defineTask<TPayload>(
  definition: QueueTaskDefinition<TPayload>,
): QueueTaskDefinition<TPayload> {
  return definition;
}

export function defineQueue<TPayload>(
  name: string,
  task: QueueTaskDefinition<TPayload>,
): QueueDefinition<TPayload> {
  return { name, task };
}

export async function runWorkerTick<THelpers = unknown>(
  input: WorkerTickInput<THelpers>,
): Promise<WorkerTickResult> {
  const job = await input.store.claimNext(input.queue, input.workerId, input.now);
  if (!job) return { status: "idle", queue: input.queue, workerId: input.workerId };

  try {
    await input.registry.runTask(job.kind, job.payload, input.helpers);
    await input.store.complete(job.id);
    return {
      status: "succeeded",
      jobId: job.id,
      queue: job.queue,
      kind: job.kind,
      traceId: job.traceId,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const retryable = job.attempts < job.maxAttempts;
    await input.store.fail(job.id, reason, { retryable });
    return {
      status: retryable ? "retryable-failed" : "terminal-failed",
      jobId: job.id,
      queue: job.queue,
      kind: job.kind,
      traceId: job.traceId,
      reason,
    };
  }
}

export function rollupJobQueueMetrics(
  jobs: readonly LocalJob[],
  now = new Date(),
): JobQueueMetrics[] {
  const grouped = new Map<string, LocalJob[]>();
  for (const job of jobs) {
    const list = grouped.get(job.queue) ?? [];
    list.push(job);
    grouped.set(job.queue, list);
  }

  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([queue, queueJobs]) => {
    const queuedJobs = queueJobs.filter((job) => job.status === "queued");
    const retryableFailures = queueJobs.filter((job) =>
      job.status === "queued" && Boolean(job.lastError) && job.attempts < job.maxAttempts
    ).length;
    const terminalFailures = queueJobs.filter((job) => job.status === "failed").length;
    const oldestQueued = queuedJobs.reduce<Date | null>((oldest, job) => {
      if (!oldest || job.createdAt < oldest) return job.createdAt;
      return oldest;
    }, null);

    return {
      queue,
      depth: queuedJobs.length,
      running: queueJobs.filter((job) => job.status === "running").length,
      succeeded: queueJobs.filter((job) => job.status === "succeeded").length,
      failures: retryableFailures + terminalFailures,
      retryableFailures,
      terminalFailures,
      oldestQueuedLatencyMs: oldestQueued ? Math.max(0, now.getTime() - oldestQueued.getTime()) : null,
    };
  });
}

export async function registerRepoWorkerBootstrap(deps: RepoWorkerBootstrapDeps): Promise<void> {
  const [local, remote] = await Promise.all([
    import("@integration-hub/application/repos/workers/sync-local.ts"),
    import("@integration-hub/application/repos/workers/sync-remote.ts"),
  ]);

  local.registerRepoSyncLocalWorkerTask(deps.registry, deps.localRepositories);
  remote.registerRepoSyncRemoteWorkerTask(deps.registry, deps.remoteRepositories, deps.remoteOptions);
  remote.registerRepoLruWarmupWorkerTask(deps.registry, deps.remoteRepositories, deps.remoteQueue);
  deps.registerCron?.(remote.REPO_LRU_WARMUP_CRON);
}

export async function registerNotificationWorkerBootstrap(deps: NotificationWorkerBootstrapDeps): Promise<void> {
  const [delivery, retry] = await Promise.all([
    import("@notification-center/application/delivery-runtime/delivery-worker.ts"),
    import("@notification-center/application/delivery-runtime/delivery-retry.ts"),
  ]);

  delivery.registerNotificationDeliveryWorkerTasks(deps.registry, deps.repositories, deps.options);
  deps.registerCron?.(retry.NOTIFICATION_DELIVERY_RETRY_CRON);
}
