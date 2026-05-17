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
