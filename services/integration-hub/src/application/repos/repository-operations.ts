import type { EntityManager } from "@mikro-orm/postgresql";
import { basename, resolve } from "node:path";

import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { Event } from "@platform-core/infrastructure/application-database/entities/core/Event.ts";
import { Repo } from "@platform-core/infrastructure/application-database/entities/repos/Repo.ts";
import { RepoRepository } from "@platform-core/infrastructure/application-database/repositories/repos/RepoRepository.ts";
import { REPO_SYNC_LOCAL_TASK } from "@integration-hub/application/repos/workers/sync-local.ts";
import { REPO_SYNC_REMOTE_TASK } from "@integration-hub/application/repos/workers/sync-remote.ts";
import type { AppContext } from "@integration-hub/domain/repository.ts";

type RepoSyncTaskName = typeof REPO_SYNC_LOCAL_TASK | typeof REPO_SYNC_REMOTE_TASK;
type RepoEventVerb = "repo.registered" | "repo.sync.requested" | "repo.unregistered";

export type ListRepositoriesInput = {
  includeArchived?: boolean;
} | undefined;

export type RegisterRepositoryInput =
  | {
    kind: "local";
    path: string;
    name?: string;
    slug?: string;
  }
  | {
    kind: "remote";
    url: string;
    name?: string;
    slug?: string;
  };

export interface RepositoryOutput {
  id: string;
  orgId: string;
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
}

export interface RepositorySyncResult {
  repoId: string;
  status: "queued";
  taskName: RepoSyncTaskName;
  jobKey: string;
}

export interface RepositoryStatusResult {
  repoId: string;
  orgId: string;
  status: "queued" | "running" | "stale" | "synced" | "failed";
  syncStatus: string;
  lastSyncAt: Date | null;
  lastTouchedAt: Date | null;
}

export interface RepoTaskQueue {
  addJob(
    name: RepoSyncTaskName,
    payload: { repoId: string },
    options: { jobKey: string },
  ): Promise<unknown>;
}

export async function listRepositories(
  em: EntityManager,
  ctx: AppContext,
  input?: ListRepositoriesInput,
): Promise<RepositoryOutput[]> {
  const repoRepository = repoRepo(em);
  const repos = await repoRepository.list({
    orgId: ctx.orgId,
    includeArchived: input?.includeArchived ?? false,
  });
  return repos.map(serializeRepository);
}

export async function getRepository(
  em: EntityManager,
  ctx: AppContext,
  id: string,
): Promise<RepositoryOutput | null> {
  const repo = await repoRepo(em).get({ orgId: ctx.orgId, id });
  return repo ? serializeRepository(repo) : null;
}

export async function registerRepository(
  em: EntityManager,
  ctx: AppContext,
  input: RegisterRepositoryInput,
): Promise<RepositoryOutput> {
  const repoRepository = repoRepo(em);
  const created = input.kind === "local"
    ? repoRepository.create({
      orgId: ctx.orgId,
      name: input.name ?? basename(resolve(input.path)),
      slug: input.slug ?? basename(resolve(input.path)),
      kind: "local",
      localPath: resolve(input.path),
      remoteUrl: null,
    })
    : repoRepository.create({
      orgId: ctx.orgId,
      name: input.name ?? slugFromRemoteUrl(input.url),
      slug: input.slug ?? slugFromRemoteUrl(input.url),
      kind: "remote",
      localPath: null,
      remoteUrl: input.url,
    });

  await emitRepoEvent(em, ctx, {
    verb: "repo.registered",
    repoId: created.id,
    payload: { kind: created.kind, slug: created.slug },
  });
  await em.flush();
  return serializeRepository(created);
}

export async function requestRepositorySync(
  em: EntityManager,
  ctx: AppContext,
  repoId: string,
): Promise<RepositoryOutput | null> {
  const updated = await repoRepo(em).update({
    orgId: ctx.orgId,
    id: repoId,
    syncStatus: "syncing",
  });
  if (!updated) return null;

  await emitRepoEvent(em, ctx, {
    verb: "repo.sync.requested",
    repoId: updated.id,
    payload: { kind: updated.kind },
  });
  await em.flush();
  return serializeRepository(updated);
}

export async function enqueueRepositorySync(
  em: EntityManager,
  ctx: AppContext,
  repoId: string,
  queue: RepoTaskQueue,
): Promise<RepositorySyncResult | null> {
  const repoRepository = repoRepo(em);
  const repo = await repoRepository.get({ orgId: ctx.orgId, id: repoId });
  if (!repo) return null;

  const taskName = repoSyncTaskName(repo);
  const result = await createRepoTask({ queue, repoId: repo.id, taskName });
  const updated = await repoRepository.update({
    orgId: ctx.orgId,
    id: repo.id,
    syncStatus: "syncing",
  });
  await emitRepoEvent(em, ctx, {
    verb: "repo.sync.requested",
    repoId: repo.id,
    payload: { kind: updated?.kind ?? repo.kind, taskName: result.taskName, jobKey: result.jobKey },
  });
  await em.flush();
  return result;
}

export async function getRepositoryStatus(
  em: EntityManager,
  ctx: AppContext,
  repoId: string,
): Promise<RepositoryStatusResult | null> {
  const repo = await repoRepo(em).get({ orgId: ctx.orgId, id: repoId });
  return repo ? serializeRepoStatus(repo) : null;
}

export async function unregisterRepository(
  em: EntityManager,
  ctx: AppContext,
  repoId: string,
): Promise<RepositoryOutput | null> {
  const archived = await repoRepo(em).archive({ orgId: ctx.orgId, id: repoId });
  if (!archived) return null;

  await emitRepoEvent(em, ctx, {
    verb: "repo.unregistered",
    repoId: archived.id,
    payload: { slug: archived.slug },
  });
  await em.flush();
  return serializeRepository(archived);
}

export async function createRepoTask(input: {
  queue: RepoTaskQueue;
  repoId: string;
  taskName: RepoSyncTaskName;
}): Promise<RepositorySyncResult> {
  const jobKey = `${input.taskName}:${input.repoId}`;
  await input.queue.addJob(input.taskName, { repoId: input.repoId }, { jobKey });
  return {
    repoId: input.repoId,
    status: "queued",
    taskName: input.taskName,
    jobKey,
  };
}

function repoRepo(em: EntityManager): RepoRepository {
  return em.getRepository(Repo) as RepoRepository;
}

function serializeRepository(repo: Repo): RepositoryOutput {
  return {
    id: repo.id,
    orgId: repo.org.id,
    name: repo.name,
    slug: repo.slug,
    kind: repo.kind,
    localPath: repo.localPath ?? null,
    remoteUrl: repo.remoteUrl ?? null,
    defaultBranch: repo.defaultBranch ?? null,
    currentBranch: repo.currentBranch ?? null,
    lastSyncAt: repo.lastSyncAt ?? null,
    syncStatus: repo.syncStatus,
    lastTouchedAt: repo.lastTouchedAt ?? null,
    archived: repo.archived,
  };
}

function serializeRepoStatus(repo: Repo): RepositoryStatusResult {
  return {
    repoId: repo.id,
    orgId: repo.org.id,
    status: statusFromRepo(repo),
    syncStatus: repo.syncStatus,
    lastSyncAt: repo.lastSyncAt ?? null,
    lastTouchedAt: repo.lastTouchedAt ?? null,
  };
}

function statusFromRepo(repo: Repo): RepositoryStatusResult["status"] {
  if (repo.syncStatus === "error" || repo.syncStatus === "failed") return "failed";
  if (repo.syncStatus === "syncing" || repo.syncStatus === "running") return "running";
  if (!repo.lastSyncAt) return "stale";

  const staleAfterMs = 30 * 60 * 1_000;
  return Date.now() - repo.lastSyncAt.getTime() > staleAfterMs ? "stale" : "synced";
}

function repoSyncTaskName(repo: Repo): RepoSyncTaskName {
  return repo.kind === "local" ? REPO_SYNC_LOCAL_TASK : REPO_SYNC_REMOTE_TASK;
}

function slugFromRemoteUrl(url: string): string {
  const withoutTrailingSlash = url.replace(/\/$/, "");
  const lastSegment = withoutTrailingSlash.split(/[/:]/).filter(Boolean).at(-1) ?? "repo";
  return lastSegment.replace(/\.git$/, "") || "repo";
}

async function emitRepoEvent(
  em: EntityManager,
  ctx: AppContext,
  input: {
    verb: RepoEventVerb;
    repoId: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const event = em.create(Event, {
    org: em.getReference(Org, ctx.orgId),
    verb: input.verb,
    subjectKind: "repo",
    subjectId: input.repoId,
    payload: input.payload ?? {},
    createdAt: new Date(),
  });
  em.persist(event);
}
