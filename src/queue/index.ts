import type { WorkerPayloadAssertion, WorkerRegistry, WorkerTaskHandler } from "../workers/registry.ts";
import type { RepoSyncLocalRepositories } from "../repos/workers/sync-local.ts";
import type {
  RepoSyncRemoteOptions,
  RepoSyncRemoteQueue,
  RepoSyncRemoteRepositories,
} from "../repos/workers/sync-remote.ts";

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
    import("../repos/workers/sync-local.ts"),
    import("../repos/workers/sync-remote.ts"),
  ]);

  local.registerRepoSyncLocalWorkerTask(deps.registry, deps.localRepositories);
  remote.registerRepoSyncRemoteWorkerTask(deps.registry, deps.remoteRepositories, deps.remoteOptions);
  remote.registerRepoLruWarmupWorkerTask(deps.registry, deps.remoteRepositories, deps.remoteQueue);
  deps.registerCron?.(remote.REPO_LRU_WARMUP_CRON);
}
