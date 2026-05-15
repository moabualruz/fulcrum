import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";

import {
  IntegrationRepositoryBranchEntity,
  IntegrationRepositoryCommitEntity,
  IntegrationRepositoryEntity,
  type IntegrationRepositoryBranch,
  type IntegrationRepositoryCommit,
  type IntegrationRepository,
} from "@integration-hub/infrastructure/database/repository.entities.ts";

export type RepositorySyncTaskName = "repo.sync.local" | "repo.sync.remote";

export interface RepositoryPublicRow {
  id: string;
  orgId: string;
  projectId: string | null;
  name: string;
  slug: string;
  kind: "local" | "remote";
  localPath: string | null;
  remoteUrl: string | null;
  defaultBranch: string | null;
  currentBranch: string | null;
  lastSyncAt: Date | null;
  syncStatus: string;
  lastTouchedAt: Date | null;
  archived: boolean;
  traceId: string;
}

export interface RepositoryPublicSyncResult {
  repoId: string;
  status: "queued";
  taskName: RepositorySyncTaskName;
  jobKey: string;
}

export interface RepositoryPublicStatus {
  repoId: string;
  orgId: string;
  status: "queued" | "running" | "stale" | "synced" | "failed";
  syncStatus: string;
  lastSyncAt: Date | null;
  lastTouchedAt: Date | null;
}

export interface RepositoryPublicBranchRow {
  id: string;
  orgId: string;
  repoId: string;
  name: string;
  headSha: string | null;
  isCurrent: boolean;
  isDefault: boolean;
  source: string | null;
  lastSeenAt: Date | null;
  traceId: string;
}

export interface RepositoryPublicCommitRow {
  id: string;
  orgId: string;
  repoId: string;
  sha: string;
  branch: string | null;
  message: string;
  authorName: string | null;
  authorEmail: string | null;
  committedAt: Date;
  parentShas: string[];
  traceId: string;
}

export class RepositoryPublicStore {
  constructor(private readonly dataSource: DataSource) {}

  async list(input: { orgId: string; includeArchived?: boolean }): Promise<RepositoryPublicRow[]> {
    const where = input.includeArchived
      ? { orgId: input.orgId }
      : { orgId: input.orgId, archived: false };
    const repos = await this.repository().find({
      where,
      order: { name: "ASC", id: "ASC" },
    });

    return repos.map(toPublicRow);
  }

  async register(input: {
    orgId: string;
    projectId?: string | null;
    name: string;
    slug?: string;
    kind?: "local" | "remote";
    localPath?: string | null;
    remoteUrl?: string | null;
    defaultBranch?: string | null;
  }): Promise<RepositoryPublicRow> {
    const id = randomUUID();
    const repo = await this.repository().save({
      id,
      orgId: input.orgId,
      projectId: input.projectId ?? null,
      name: input.name,
      slug: input.slug ?? slugify(input.name),
      kind: input.kind ?? (input.remoteUrl ? "remote" : "local"),
      localPath: input.localPath ?? null,
      remoteUrl: input.remoteUrl ?? null,
      defaultBranch: input.defaultBranch ?? "main",
      currentBranch: input.defaultBranch ?? "main",
      lastSyncAt: null,
      syncStatus: "idle",
      lastTouchedAt: new Date(),
      archived: false,
      traceId: `trace-repo-${id}`,
    });
    return toPublicRow(repo);
  }

  async get(input: { orgId: string; repoId: string }): Promise<RepositoryPublicRow | null> {
    const repo = await this.repository().findOneBy({
      id: input.repoId,
      orgId: input.orgId,
    });
    return repo ? toPublicRow(repo) : null;
  }

  async sync(input: { orgId: string }): Promise<{ data: RepositoryPublicSyncResult[] }> {
    const repos = await this.repository().findBy({ orgId: input.orgId, archived: false });
    const data: RepositoryPublicSyncResult[] = [];
    for (const repo of repos) {
      repo.syncStatus = "syncing";
      repo.lastTouchedAt = new Date();
      await this.repository().save(repo);
      const taskName = repo.kind === "local" ? "repo.sync.local" : "repo.sync.remote";
      data.push({
        repoId: repo.id,
        status: "queued",
        taskName,
        jobKey: `${taskName}:${repo.id}`,
      });
    }
    return { data };
  }

  async syncRepo(input: { orgId: string; repoId: string }): Promise<RepositoryPublicSyncResult | null> {
    const repo = await this.repository().findOneBy({
      id: input.repoId,
      orgId: input.orgId,
      archived: false,
    });
    if (!repo) return null;

    repo.syncStatus = "syncing";
    repo.lastTouchedAt = new Date();
    await this.repository().save(repo);

    const taskName = repo.kind === "local" ? "repo.sync.local" : "repo.sync.remote";
    return {
      repoId: repo.id,
      status: "queued",
      taskName,
      jobKey: `${taskName}:${repo.id}`,
    };
  }

  async statusRepo(input: { orgId: string; repoId: string }): Promise<RepositoryPublicStatus | null> {
    const repo = await this.repository().findOneBy({
      id: input.repoId,
      orgId: input.orgId,
    });
    if (!repo) return null;

    return {
      repoId: repo.id,
      orgId: repo.orgId,
      status: statusFromRepo(repo),
      syncStatus: repo.syncStatus,
      lastSyncAt: repo.lastSyncAt,
      lastTouchedAt: repo.lastTouchedAt,
    };
  }

  async unregister(input: { orgId: string; repoId: string }): Promise<void> {
    const repo = await this.repository().findOneBy({
      id: input.repoId,
      orgId: input.orgId,
    });
    if (!repo) return;
    repo.archived = true;
    repo.syncStatus = "unregistered";
    repo.lastTouchedAt = new Date();
    await this.repository().save(repo);
  }

  async listBranches(input: { orgId: string; repoId?: string; limit?: number }): Promise<RepositoryPublicBranchRow[]> {
    const branches = await this.branchRepository().find({
      where: compactObject({
        orgId: input.orgId,
        repoId: input.repoId,
      }),
      order: { isDefault: "DESC", isCurrent: "DESC", name: "ASC", id: "ASC" },
      take: clampLimit(input.limit),
    });

    return branches.map(toPublicBranchRow);
  }

  async getBranch(input: { orgId: string; id: string }): Promise<RepositoryPublicBranchRow | null> {
    const branch = await this.branchRepository().findOneBy({
      id: input.id,
      orgId: input.orgId,
    });
    return branch ? toPublicBranchRow(branch) : null;
  }

  async listCommits(input: {
    orgId: string;
    repoId?: string;
    branch?: string;
    limit?: number;
  }): Promise<RepositoryPublicCommitRow[]> {
    const commits = await this.commitRepository().find({
      where: compactObject({
        orgId: input.orgId,
        repoId: input.repoId,
        branch: input.branch,
      }),
      order: { committedAt: "DESC", id: "ASC" },
      take: clampLimit(input.limit),
    });

    return commits.map(toPublicCommitRow);
  }

  async getCommit(input: { orgId: string; id: string }): Promise<RepositoryPublicCommitRow | null> {
    const commit = await this.commitRepository().findOneBy({
      id: input.id,
      orgId: input.orgId,
    });
    return commit ? toPublicCommitRow(commit) : null;
  }

  private repository() {
    return this.dataSource.getRepository(IntegrationRepositoryEntity);
  }

  private branchRepository() {
    return this.dataSource.getRepository(IntegrationRepositoryBranchEntity);
  }

  private commitRepository() {
    return this.dataSource.getRepository(IntegrationRepositoryCommitEntity);
  }
}

function slugify(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || `repo-${randomUUID()}`;
}

function toPublicRow(repo: IntegrationRepository): RepositoryPublicRow {
  return {
    id: repo.id,
    orgId: repo.orgId,
    projectId: repo.projectId,
    name: repo.name,
    slug: repo.slug,
    kind: repo.kind,
    localPath: repo.localPath,
    remoteUrl: repo.remoteUrl,
    defaultBranch: repo.defaultBranch,
    currentBranch: repo.currentBranch,
    lastSyncAt: repo.lastSyncAt,
    syncStatus: repo.syncStatus,
    lastTouchedAt: repo.lastTouchedAt,
    archived: repo.archived,
    traceId: repo.traceId,
  };
}

function toPublicBranchRow(branch: IntegrationRepositoryBranch): RepositoryPublicBranchRow {
  return {
    id: branch.id,
    orgId: branch.orgId,
    repoId: branch.repoId,
    name: branch.name,
    headSha: branch.headSha,
    isCurrent: branch.isCurrent,
    isDefault: branch.isDefault,
    source: branch.source,
    lastSeenAt: branch.lastSeenAt,
    traceId: branch.traceId,
  };
}

function toPublicCommitRow(commit: IntegrationRepositoryCommit): RepositoryPublicCommitRow {
  return {
    id: commit.id,
    orgId: commit.orgId,
    repoId: commit.repoId,
    sha: commit.sha,
    branch: commit.branch,
    message: commit.message,
    authorName: commit.authorName,
    authorEmail: commit.authorEmail,
    committedAt: commit.committedAt,
    parentShas: commit.parentShas ?? [],
    traceId: commit.traceId,
  };
}

function statusFromRepo(repo: IntegrationRepository): RepositoryPublicStatus["status"] {
  if (repo.syncStatus === "error" || repo.syncStatus === "failed") return "failed";
  if (repo.syncStatus === "syncing" || repo.syncStatus === "running") return "running";
  if (!repo.lastSyncAt) return "stale";

  const staleAfterMs = 30 * 60 * 1_000;
  return Date.now() - repo.lastSyncAt.getTime() > staleAfterMs ? "stale" : "synced";
}

function compactObject<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function clampLimit(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(200, Math.trunc(value)));
}
