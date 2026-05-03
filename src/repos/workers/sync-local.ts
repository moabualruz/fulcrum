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
      orgId: string;
      verb: "repo.sync.failed";
      subjectKind: "repo";
      subjectId: string;
      payload: Record<string, unknown>;
    }): Promise<unknown>;
  };
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

  try {
    const git = repositories.git ?? defaultGit;
    const status = await git.getStatus(repo.localPath);
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

export async function enqueueRepoSyncLocal(
  queue: RepoSyncLocalQueue,
  repoId: string,
): Promise<void> {
  await queue.addJob("repo.sync.local", { repoId }, { jobKey: `repo.sync.local:${repoId}` });
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
