import { homedir } from "node:os";
import { join } from "node:path";

import {
  ensureMirror,
  getCommitLog,
  getFileTree,
  listBranches,
  type GitBranch,
  type GitCommit,
  type GitFileTreeEntry,
} from "../git.ts";
import type { WorkerRegistry } from "../../workers/registry.ts";
import { assertRecordPayload, assertStringField } from "../../workers/registry.ts";
import type {
  RepoSyncBranchInput,
  RepoSyncCommitInput,
  RepoSyncFileInput,
  RepoSyncStateInput,
} from "./sync-local.ts";

export const REPO_SYNC_REMOTE_TASK = "repo.sync.remote";
export const REPO_LRU_WARMUP_TASK = "repo.lru.warmup";
export const REPO_LRU_WARMUP_LIMIT = 5;

export interface RepoSyncRemotePayload {
  repoId: string;
}

export interface RepoSyncRemoteRepo {
  id: string;
  orgId: string;
  projectId?: string | null;
  kind: "local" | "remote";
  remoteUrl?: string | null;
  slug?: string | null;
  syncStatus: string;
}

export interface RepoWarmupCandidate {
  id: string;
  lastAccessedAt?: Date | string | number | null;
  lastTouchedAt?: Date | string | number | null;
  failureCount?: number | null;
}

export interface RepoSyncRemoteRepositories {
  repoRepo: {
    findRemoteById(id: string): Promise<RepoSyncRemoteRepo | null>;
    updateSyncState(input: RepoSyncStateInput): Promise<unknown>;
    listRecentlyTouchedRemote(limit: number): Promise<RepoWarmupCandidate[]>;
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
      orgId: string;
      verb: "repo.sync.failed";
      subjectKind: "repo";
      subjectId: string;
      payload: Record<string, unknown>;
    }): Promise<unknown>;
  };
  git?: RepoSyncRemoteGitClient;
}

export interface RepoSyncRemoteGitClient {
  ensureMirror(remoteUrl: string, mirrorPath: string): Promise<void>;
  listBranches(mirrorPath: string): Promise<GitBranch[]>;
  getCommitLog(mirrorPath: string, options: { maxCount: 200; offset: 0 }): Promise<GitCommit[]>;
  getFileTree(mirrorPath: string): Promise<GitFileTreeEntry[]>;
}

export interface RepoSyncRemoteQueue {
  addJob(
    name: "repo.sync.remote",
    payload: RepoSyncRemotePayload,
    options: { jobKey: string },
  ): Promise<unknown>;
}

export interface RepoSyncRemoteOptions {
  mirrorRoot?: string;
}

export type RepoSyncRemoteTask = (payload: RepoSyncRemotePayload) => Promise<void>;
export type RepoLruWarmupTask = () => Promise<void>;

const defaultGit: RepoSyncRemoteGitClient = {
  ensureMirror,
  listBranches,
  getCommitLog: (mirrorPath) => getCommitLog(mirrorPath, { branch: "--all", maxCount: 200, offset: 0 }),
  getFileTree: (mirrorPath) => getFileTree(mirrorPath),
};

export function createRepoSyncRemoteTask(
  repositories: RepoSyncRemoteRepositories,
  options: RepoSyncRemoteOptions = {},
): RepoSyncRemoteTask {
  return async (payload) => syncRemoteRepo(payload, repositories, options);
}

export async function syncRemoteRepo(
  payload: RepoSyncRemotePayload,
  repositories: RepoSyncRemoteRepositories,
  options: RepoSyncRemoteOptions = {},
): Promise<void> {
  const repo = await repositories.repoRepo.findRemoteById(payload.repoId);
  if (!repo || repo.kind !== "remote" || !repo.remoteUrl) {
    throw new Error(`Remote repo not found: ${payload.repoId}`);
  }

  await repositories.repoRepo.updateSyncState({
    repoId: repo.id,
    orgId: repo.orgId,
    syncStatus: "syncing",
  });

  try {
    const mirrorPath = resolveRemoteMirrorPath(
      options.mirrorRoot ?? join(homedir(), ".fulcrum", "repos"),
      repo.orgId,
      repo.slug ?? repo.id,
    );
    const git = repositories.git ?? defaultGit;
    await git.ensureMirror(repo.remoteUrl, mirrorPath);

    const branches = await git.listBranches(mirrorPath);
    await repositories.branches.upsertBulk({
      orgId: repo.orgId,
      repoId: repo.id,
      branches: branches.map(toBranchInput),
    });

    const commits = await git.getCommitLog(mirrorPath, { maxCount: 200, offset: 0 });
    await repositories.commits.upsertBulk({
      orgId: repo.orgId,
      repoId: repo.id,
      commits: commits.map(toCommitInput),
    });

    const files = (await git.getFileTree(mirrorPath)).map(toFileInput);
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
  } catch (error) {
    await repositories.repoRepo.updateSyncState({
      repoId: repo.id,
      orgId: repo.orgId,
      syncStatus: "error",
    });
    await repositories.events.insert({
      orgId: repo.orgId,
      verb: "repo.sync.failed",
      subjectKind: "repo",
      subjectId: repo.id,
      payload: {
        message: errorMessage(error),
      },
    });
    throw error;
  }
}

export async function enqueueRepoSyncRemote(
  queue: RepoSyncRemoteQueue,
  repoId: string,
): Promise<void> {
  await queue.addJob(REPO_SYNC_REMOTE_TASK, { repoId }, { jobKey: `${REPO_SYNC_REMOTE_TASK}:${repoId}` });
}

export function assertRepoSyncRemotePayload(payload: unknown): asserts payload is RepoSyncRemotePayload {
  assertRecordPayload(payload, REPO_SYNC_REMOTE_TASK);
  assertStringField(payload, "repoId", REPO_SYNC_REMOTE_TASK);
}

export function registerRepoSyncRemoteWorkerTask(
  registry: WorkerRegistry,
  repositories: RepoSyncRemoteRepositories,
  options: RepoSyncRemoteOptions = {},
): void {
  registry.registerTask(REPO_SYNC_REMOTE_TASK, assertRepoSyncRemotePayload, createRepoSyncRemoteTask(repositories, options));
}

export function createRepoLruWarmupTask(
  repositories: RepoSyncRemoteRepositories,
  queue: RepoSyncRemoteQueue,
): RepoLruWarmupTask {
  return async () => {
    const repos = selectTopRemoteReposForWarmup(
      await repositories.repoRepo.listRecentlyTouchedRemote(REPO_LRU_WARMUP_LIMIT),
      REPO_LRU_WARMUP_LIMIT,
    );
    for (const repo of repos) {
      await enqueueRepoSyncRemote(queue, repo.id);
    }
  };
}

export function selectTopRemoteReposForWarmup(
  repos: RepoWarmupCandidate[],
  limit = REPO_LRU_WARMUP_LIMIT,
): RepoWarmupCandidate[] {
  return [...repos]
    .sort((left, right) => warmupScore(right) - warmupScore(left))
    .slice(0, Math.max(0, limit));
}

export function resolveRemoteMirrorPath(root: string, orgSlug: string, repoSlug: string): string {
  return join(root, safePathSegment(orgSlug), safePathSegment(repoSlug));
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

function safePathSegment(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "repo";
}

function warmupScore(repo: RepoWarmupCandidate): number {
  const accessed = timestamp(repo.lastAccessedAt ?? repo.lastTouchedAt);
  const failures = Math.max(0, repo.failureCount ?? 0);
  return accessed - failures * 60 * 60 * 1_000;
}

function timestamp(value: Date | string | number | null | undefined): number {
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
