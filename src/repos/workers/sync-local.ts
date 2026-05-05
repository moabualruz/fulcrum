import {
  getCommitLog,
  getFileTree,
  getStatus,
  listBranches,
  type GitBranch,
  type GitCommit,
  type GitFileTreeEntry,
  type GitStatus,
} from "../git.ts";
import type { WorkerRegistry } from "../../workers/registry.ts";
import { assertRecordPayload, assertStringField } from "../../workers/registry.ts";
import { defineQueue, defineTask } from "../../queue/index.ts";
import { enqueueNotifyFanout, type NotifyFanoutQueue } from "../../notifications/fanout-worker.ts";

export const REPO_SYNC_LOCAL_TASK = "repo.sync.local";
export const repoSyncLocalTaskDefinition = defineTask<RepoSyncLocalPayload>({
  name: REPO_SYNC_LOCAL_TASK,
  assertPayload: assertRepoSyncLocalPayload,
});
export const repoSyncLocalQueueDefinition = defineQueue(REPO_SYNC_LOCAL_TASK, repoSyncLocalTaskDefinition);

export interface RepoSyncLocalPayload {
  repoId: string;
}

export interface RepoSyncLocalRepo {
  id: string;
  orgId: string;
  projectId?: string | null;
  kind: "local" | "remote";
  localPath?: string | null;
  syncStatus: string;
}

export interface RepoSyncStateInput {
  repoId: string;
  orgId: string;
  syncStatus: "syncing" | "idle" | "error";
  currentBranch?: string | null;
  lastSyncAt?: Date;
  lastTouchedAt?: Date;
}

export interface RepoSyncLocalRepositories {
  repoRepo: {
    findLocalById(id: string): Promise<RepoSyncLocalRepo | null>;
    updateSyncState(input: RepoSyncStateInput): Promise<unknown>;
  };
  branches: {
    upsertBulk(input: {
      orgId: string;
      repoId: string;
      branches: RepoSyncBranchInput[];
    }): Promise<unknown>;
  };
  commits: {
    upsertBulk(input: {
      orgId: string;
      repoId: string;
      commits: RepoSyncCommitInput[];
    }): Promise<unknown>;
  };
  files: {
    upsertBulk(input: {
      orgId: string;
      repoId: string;
      files: RepoSyncFileInput[];
    }): Promise<unknown>;
  };
  searchDocuments: {
    upsertRepoFiles(input: {
      orgId: string;
      projectId?: string | null;
      repoId: string;
      sourceKind: "repo_file";
      files: RepoSyncFileInput[];
    }): Promise<unknown>;
  };
  events: {
    insert(input: {
      id?: string;
      eventType?: "repo.sync.completed" | "repo.sync.failed";
      orgId: string;
      projectId?: string | null;
      actorUserId?: string | null;
      verb: "repo.sync.completed" | "repo.sync.failed";
      subjectKind: "repo";
      subjectId: string;
      payload: Record<string, unknown>;
    }): Promise<unknown>;
  };
  fanoutQueue?: NotifyFanoutQueue;
  git?: RepoSyncGitClient;
}

export interface RepoSyncGitClient {
  getStatus(localPath: string): Promise<GitStatus>;
  listBranches(localPath: string): Promise<GitBranch[]>;
  getCommitLog(localPath: string, options: { maxCount: 200; offset: 0 }): Promise<GitCommit[]>;
  getFileTree(localPath: string): Promise<GitFileTreeEntry[]>;
}

export interface RepoSyncBranchInput {
  name: string;
  sha: string;
  isDefault: boolean;
  isCurrent: boolean;
}

export interface RepoSyncCommitInput {
  sha: string;
  message: string;
  author: string;
  committedAt: Date;
}

export interface RepoSyncFileInput {
  path: string;
  kind: "file" | "dir";
  size: number;
}

export interface RepoSyncLocalQueue {
  addJob(
    name: "repo.sync.local",
    payload: RepoSyncLocalPayload,
    options: { jobKey: string },
  ): Promise<unknown>;
}

export type RepoSyncLocalTask = (payload: RepoSyncLocalPayload) => Promise<void>;

const defaultGit: RepoSyncGitClient = {
  getStatus,
  listBranches,
  getCommitLog: (localPath) => getCommitLog(localPath, { maxCount: 200, offset: 0 }),
  getFileTree: (localPath) => getFileTree(localPath),
};

export function createRepoSyncLocalTask(
  repositories: RepoSyncLocalRepositories,
): RepoSyncLocalTask {
  return async (payload) => syncLocalRepo(payload, repositories);
}

export async function syncLocalRepo(
  payload: RepoSyncLocalPayload,
  repositories: RepoSyncLocalRepositories,
): Promise<void> {
  const repo = await repositories.repoRepo.findLocalById(payload.repoId);
  if (!repo || repo.kind !== "local" || !repo.localPath) {
    throw new Error(`Local repo not found: ${payload.repoId}`);
  }

  await repositories.repoRepo.updateSyncState({
    repoId: repo.id,
    orgId: repo.orgId,
    syncStatus: "syncing",
  });

  const startedAt = performance.now();
  let status: GitStatus | undefined;
  let commitCount = 0;
  try {
    const git = repositories.git ?? defaultGit;
    status = await git.getStatus(repo.localPath);
    await repositories.repoRepo.updateSyncState({
      repoId: repo.id,
      orgId: repo.orgId,
      syncStatus: "syncing",
      currentBranch: status.branch,
    });

    const branches = await git.listBranches(repo.localPath);
    await repositories.branches.upsertBulk({
      orgId: repo.orgId,
      repoId: repo.id,
      branches: branches.map(toBranchInput),
    });

    const commits = await git.getCommitLog(repo.localPath, { maxCount: 200, offset: 0 });
    commitCount = commits.length;
    await repositories.commits.upsertBulk({
      orgId: repo.orgId,
      repoId: repo.id,
      commits: commits.map(toCommitInput),
    });

    const files = (await git.getFileTree(repo.localPath)).map(toFileInput);
    await repositories.files.upsertBulk({
      orgId: repo.orgId,
      repoId: repo.id,
      files,
    });
    await repositories.searchDocuments.upsertRepoFiles({
      orgId: repo.orgId,
      projectId: repo.projectId ?? null,
      repoId: repo.id,
      sourceKind: "repo_file",
      files,
    });

    const now = new Date();
    await repositories.repoRepo.updateSyncState({
      repoId: repo.id,
      orgId: repo.orgId,
      syncStatus: "idle",
      lastSyncAt: now,
      lastTouchedAt: now,
    });
    await emitRepoSyncEvent(repositories, repo, "repo.sync.completed", status, commitCount, startedAt);
  } catch (error) {
    await repositories.repoRepo.updateSyncState({
      repoId: repo.id,
      orgId: repo.orgId,
      syncStatus: "error",
    });
    await emitRepoSyncEvent(repositories, repo, "repo.sync.failed", status, commitCount, startedAt, error);
    throw error;
  }
}

export async function enqueueRepoSyncLocal(
  queue: RepoSyncLocalQueue,
  repoId: string,
): Promise<void> {
  await queue.addJob(REPO_SYNC_LOCAL_TASK, { repoId }, { jobKey: `${REPO_SYNC_LOCAL_TASK}:${repoId}` });
}

export function assertRepoSyncLocalPayload(payload: unknown): asserts payload is RepoSyncLocalPayload {
  assertRecordPayload(payload, REPO_SYNC_LOCAL_TASK);
  assertStringField(payload, "repoId", REPO_SYNC_LOCAL_TASK);
}

export function registerRepoSyncLocalWorkerTask(
  registry: WorkerRegistry,
  repositories: RepoSyncLocalRepositories,
): void {
  registry.registerTask(REPO_SYNC_LOCAL_TASK, assertRepoSyncLocalPayload, createRepoSyncLocalTask(repositories));
}

function toBranchInput(branch: GitBranch): RepoSyncBranchInput {
  return {
    name: branch.name,
    sha: branch.headSha,
    isDefault: branch.isDefault,
    isCurrent: branch.isCurrent,
  };
}

function toCommitInput(commit: GitCommit): RepoSyncCommitInput {
  return {
    sha: commit.sha,
    message: [commit.subject, commit.body].filter(Boolean).join("\n\n"),
    author: `${commit.authorName} <${commit.authorEmail}>`,
    committedAt: commit.committedAt,
  };
}

function toFileInput(file: GitFileTreeEntry): RepoSyncFileInput {
  return {
    path: file.path,
    kind: file.kind,
    size: file.sizeBytes,
  };
}

async function emitRepoSyncEvent(
  repositories: RepoSyncLocalRepositories,
  repo: RepoSyncLocalRepo,
  eventType: "repo.sync.completed" | "repo.sync.failed",
  status: GitStatus | undefined,
  commitCount: number,
  startedAt: number,
  error?: unknown,
): Promise<void> {
  const eventId = crypto.randomUUID();
  const event = await repositories.events.insert({
    id: eventId,
    eventType,
    orgId: repo.orgId,
    projectId: repo.projectId ?? null,
    actorUserId: null,
    verb: eventType,
    subjectKind: "repo",
    subjectId: repo.id,
    payload: {
      branch: status?.branch ?? "unknown",
      ahead: status?.ahead ?? 0,
      behind: status?.behind ?? 0,
      dirty: status?.dirty ?? false,
      commitCount,
      syncLatencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      ...(error ? { message: errorMessage(error) } : {}),
    },
  });
  if (repositories.fanoutQueue) {
    await enqueueNotifyFanout(repositories.fanoutQueue, eventIdFromInsertResult(event) ?? eventId);
  }
}

function eventIdFromInsertResult(value: unknown): string | undefined {
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : undefined;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
