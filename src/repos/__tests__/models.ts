import type {
  RepoDashboardBranch,
  RepoDashboardCommit,
  RepoDashboardFile,
  RepoDashboardRepo,
  RepoDashboardRepositories,
  RepoDashboardSyncLogEntry,
} from "../dashboard.ts";

export interface MockTask {
  id: string;
  orgId: string;
  repoId: string;
  status: string | null;
}

export interface MockRepoDashboardData {
  repos: RepoDashboardRepo[];
  branches: RepoDashboardBranch[];
  commits: RepoDashboardCommit[];
  files: RepoDashboardFile[];
  tasks: MockTask[];
  syncLog: RepoDashboardSyncLogEntry[];
}

export function createMockRepo(input: Partial<RepoDashboardRepo> = {}): RepoDashboardRepo {
  return {
    id: input.id ?? "repo-1",
    orgId: input.orgId ?? "11111111-1111-4111-8111-111111111111",
    path: input.path ?? "/workspace/fulcrum",
    remoteUrl: input.remoteUrl ?? null,
    branch: input.branch ?? "main",
    dirty: input.dirty ?? false,
    lastSyncAt: input.lastSyncAt ?? null,
    syncStatus: input.syncStatus ?? "idle",
    lastTouchedAt: input.lastTouchedAt ?? null,
    watcherStatus: input.watcherStatus ?? "unknown",
    lastSyncError: input.lastSyncError ?? null,
  };
}

export function createMockBranch(input: Partial<RepoDashboardBranch> = {}): RepoDashboardBranch {
  return {
    id: input.id ?? "branch-1",
    orgId: input.orgId ?? "11111111-1111-4111-8111-111111111111",
    repoId: input.repoId ?? "repo-1",
    name: input.name ?? "main",
    sha: input.sha ?? "sha-1",
    isDefault: input.isDefault ?? false,
    isCurrent: input.isCurrent ?? false,
    updatedAt: input.updatedAt ?? new Date("2026-05-05T12:00:00.000Z"),
  };
}

export function createMockCommit(input: Partial<RepoDashboardCommit> = {}): RepoDashboardCommit {
  return {
    id: input.id ?? "commit-1",
    orgId: input.orgId ?? "11111111-1111-4111-8111-111111111111",
    repoId: input.repoId ?? "repo-1",
    sha: input.sha ?? "abcdef1234567890",
    message: input.message ?? "feat: dashboard row",
    author: input.author ?? "Fulcrum <fulcrum@example.com>",
    committedAt: input.committedAt ?? new Date("2026-05-05T12:00:00.000Z"),
  };
}

export function createMockFile(input: Partial<RepoDashboardFile> = {}): RepoDashboardFile {
  return {
    id: input.id ?? "file-1",
    orgId: input.orgId ?? "11111111-1111-4111-8111-111111111111",
    repoId: input.repoId ?? "repo-1",
    path: input.path ?? "src/index.ts",
    kind: input.kind ?? "file",
    size: input.size ?? 0,
    updatedAt: input.updatedAt ?? new Date("2026-05-05T12:00:00.000Z"),
  };
}

export function createMockTask(input: Partial<MockTask> = {}): MockTask {
  return {
    id: input.id ?? "task-1",
    orgId: input.orgId ?? "11111111-1111-4111-8111-111111111111",
    repoId: input.repoId ?? "repo-1",
    status: input.status ?? "ready",
  };
}

export function createMockSyncLog(input: Partial<RepoDashboardSyncLogEntry> = {}): RepoDashboardSyncLogEntry {
  return {
    id: input.id ?? "log-1",
    orgId: input.orgId ?? "11111111-1111-4111-8111-111111111111",
    repoId: input.repoId ?? "repo-1",
    status: input.status ?? "succeeded",
    message: input.message ?? "sync complete",
    createdAt: input.createdAt ?? new Date("2026-05-05T12:00:00.000Z"),
  };
}

export function createMockRepositories(input: Partial<MockRepoDashboardData> = {}): RepoDashboardRepositories {
  const data: MockRepoDashboardData = {
    repos: input.repos ?? [],
    branches: input.branches ?? [],
    commits: input.commits ?? [],
    files: input.files ?? [],
    tasks: input.tasks ?? [],
    syncLog: input.syncLog ?? [],
  };

  return {
    repos: {
      async listDashboard(orgId) {
        return data.repos.filter((repo) => repo.orgId === orgId);
      },
      async getDashboardRepo(orgId, repoId) {
        return data.repos.find((repo) => repo.orgId === orgId && repo.id === repoId) ?? null;
      },
    },
    branches: {
      async listLatest(orgId, repoId, limit) {
        return data.branches
          .filter((branch) => branch.orgId === orgId && branch.repoId === repoId)
          .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
          .slice(0, limit);
      },
    },
    commits: {
      async latestByRepo(orgId, repoIds) {
        return new Map(repoIds.map((repoId) => [
          repoId,
          data.commits
            .filter((commit) => commit.orgId === orgId && commit.repoId === repoId)
            .sort((left, right) => right.committedAt.getTime() - left.committedAt.getTime())[0] ?? null,
        ]));
      },
      async listLatest(orgId, repoId, limit) {
        return data.commits
          .filter((commit) => commit.orgId === orgId && commit.repoId === repoId)
          .sort((left, right) => right.committedAt.getTime() - left.committedAt.getTime())
          .slice(0, limit);
      },
    },
    files: {
      async listLatest(orgId, repoId, limit) {
        return data.files
          .filter((file) => file.orgId === orgId && file.repoId === repoId)
          .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
          .slice(0, limit);
      },
    },
    tasks: {
      async countOpenByRepo(orgId, repoIds) {
        return new Map(repoIds.map((repoId) => [
          repoId,
          data.tasks.filter((task) => task.orgId === orgId && task.repoId === repoId && task.status !== "done").length,
        ]));
      },
    },
    syncLog: {
      async listLatest(orgId, repoId, limit) {
        return data.syncLog
          .filter((entry) => entry.orgId === orgId && entry.repoId === repoId)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .slice(0, limit);
      },
    },
  };
}
