export type RepoHealth = "healthy" | "stale" | "failed";
export type RepoWatcherStatus = "watching" | "degraded" | "stopped" | "unknown";

export interface RepoDashboardRow {
  id: string;
  path: string;
  remoteUrl?: string | null;
  branch?: string | null;
  dirty: boolean;
  lastSyncAt?: string | null;
  recentCommit?: string | null;
  openTaskCount: number;
  health: RepoHealth;
  watcherStatus: RepoWatcherStatus;
  syncLatencyMs: number | null;
  lastSyncError: string | null;
}

export interface RepoDashboardRepo {
  id: string;
  orgId: string;
  path: string;
  remoteUrl?: string | null;
  branch?: string | null;
  dirty: boolean;
  lastSyncAt?: Date | string | null;
  syncStatus: string;
  lastTouchedAt?: Date | string | null;
  watcherStatus?: RepoWatcherStatus | null;
  lastSyncError?: string | null;
}

export interface RepoDashboardBranch {
  id: string;
  orgId: string;
  repoId: string;
  name: string;
  sha?: string | null;
  isDefault?: boolean;
  isCurrent?: boolean;
  updatedAt: Date;
}

export interface RepoDashboardCommit {
  id: string;
  orgId: string;
  repoId: string;
  sha: string;
  message?: string | null;
  author?: string | null;
  committedAt: Date;
}

export interface RepoDashboardFile {
  id: string;
  orgId: string;
  repoId: string;
  path: string;
  kind: string;
  size?: number | null;
  updatedAt: Date;
}

export interface RepoDashboardSyncLogEntry {
  id: string;
  orgId: string;
  repoId: string;
  status: string;
  message?: string | null;
  createdAt: Date;
}

export interface RepoDashboardDetail {
  branches: RepoDashboardBranch[];
  commits: RepoDashboardCommit[];
  files: RepoDashboardFile[];
  syncLog: RepoDashboardSyncLogEntry[];
}

export interface RepoDashboardRepositories {
  repos: {
    listDashboard(orgId: string): Promise<RepoDashboardRepo[]>;
    getDashboardRepo(orgId: string, repoId: string): Promise<RepoDashboardRepo | null>;
  };
  branches: {
    listLatest(orgId: string, repoId: string, limit: number): Promise<RepoDashboardBranch[]>;
  };
  commits: {
    latestByRepo(orgId: string, repoIds: string[]): Promise<Map<string, RepoDashboardCommit | null>>;
    listLatest(orgId: string, repoId: string, limit: number): Promise<RepoDashboardCommit[]>;
  };
  files: {
    listLatest(orgId: string, repoId: string, limit: number): Promise<RepoDashboardFile[]>;
  };
  tasks: {
    countOpenByRepo(orgId: string, repoIds: string[]): Promise<Map<string, number>>;
  };
  syncLog: {
    listLatest(orgId: string, repoId: string, limit: number): Promise<RepoDashboardSyncLogEntry[]>;
  };
}

export interface RepoDashboardOptions {
  now?: () => Date;
  staleAfterMs?: number;
  detailLimit?: number;
}

export interface RepoDashboardService {
  getRepoDashboard(orgId: string): Promise<RepoDashboardRow[]>;
  getRepoDetail(orgId: string, repoId: string): Promise<RepoDashboardDetail>;
}

const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;
const DEFAULT_DETAIL_LIMIT = 20;

let defaultService: RepoDashboardService | null = null;

export function configureRepoDashboardService(service: RepoDashboardService | null): void {
  defaultService = service;
}

export function createRepoDashboardService(
  repositories: RepoDashboardRepositories,
  options: RepoDashboardOptions = {},
): RepoDashboardService {
  const now = options.now ?? (() => new Date());
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const detailLimit = options.detailLimit ?? DEFAULT_DETAIL_LIMIT;

  return {
    async getRepoDashboard(orgId) {
      const repos = await repositories.repos.listDashboard(orgId);
      const repoIds = repos.map((repo) => repo.id);
      const [latestCommits, openTaskCounts] = await Promise.all([
        repositories.commits.latestByRepo(orgId, repoIds),
        repositories.tasks.countOpenByRepo(orgId, repoIds),
      ]);

      return repos.map((repo) => {
        const lastSyncAt = toDate(repo.lastSyncAt);
        return {
          id: repo.id,
          path: repo.path,
          remoteUrl: repo.remoteUrl ?? null,
          branch: repo.branch ?? null,
          dirty: repo.dirty,
          lastSyncAt: lastSyncAt ? lastSyncAt.toISOString() : null,
          recentCommit: formatRecentCommit(latestCommits.get(repo.id) ?? null),
          openTaskCount: openTaskCounts.get(repo.id) ?? 0,
          health: resolveHealth(repo, lastSyncAt, now(), staleAfterMs),
          watcherStatus: repo.watcherStatus ?? "unknown",
          syncLatencyMs: lastSyncAt ? Math.max(0, now().getTime() - lastSyncAt.getTime()) : null,
          lastSyncError: repo.lastSyncError ?? null,
        };
      });
    },

    async getRepoDetail(orgId, repoId) {
      const repo = await repositories.repos.getDashboardRepo(orgId, repoId);
      if (!repo) {
        return { branches: [], commits: [], files: [], syncLog: [] };
      }

      const [branches, commits, files, syncLog] = await Promise.all([
        repositories.branches.listLatest(orgId, repoId, detailLimit),
        repositories.commits.listLatest(orgId, repoId, detailLimit),
        repositories.files.listLatest(orgId, repoId, detailLimit),
        repositories.syncLog.listLatest(orgId, repoId, detailLimit),
      ]);

      return {
        branches: branches.slice(0, detailLimit),
        commits: commits.slice(0, detailLimit),
        files: files.slice(0, detailLimit),
        syncLog: syncLog.slice(0, detailLimit),
      };
    },
  };
}

export async function getRepoDashboard(orgId: string): Promise<RepoDashboardRow[]> {
  return requireDefaultService().getRepoDashboard(orgId);
}

export async function getRepoDetail(orgId: string, repoId: string): Promise<RepoDashboardDetail> {
  return requireDefaultService().getRepoDetail(orgId, repoId);
}

function requireDefaultService(): RepoDashboardService {
  if (!defaultService) {
    throw new Error("Repo dashboard service is not configured.");
  }
  return defaultService;
}

function resolveHealth(
  repo: Pick<RepoDashboardRepo, "syncStatus">,
  lastSyncAt: Date | null,
  now: Date,
  staleAfterMs: number,
): RepoHealth {
  if (repo.syncStatus === "error" || repo.syncStatus === "failed") {
    return "failed";
  }

  if (!lastSyncAt || now.getTime() - lastSyncAt.getTime() > staleAfterMs) {
    return "stale";
  }

  return "healthy";
}

function formatRecentCommit(commit: RepoDashboardCommit | null): string | null {
  if (!commit) return null;
  const subject = commit.message?.split("\n", 1)[0]?.trim();
  return [commit.sha.slice(0, 7), subject].filter(Boolean).join(" ");
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}
