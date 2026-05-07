import type { EntityManager } from "@mikro-orm/postgresql";
import { basename, resolve } from "node:path";

import { Org } from "../../db/entities/auth/Org.ts";
import { Event } from "../../db/entities/core/Event.ts";
import { Repo } from "../../db/entities/repos/Repo.ts";
import { RepoRepository } from "../../db/repositories/repos/RepoRepository.ts";
import { REPO_SYNC_LOCAL_TASK } from "../../repos/workers/sync-local.ts";
import { REPO_SYNC_REMOTE_TASK } from "../../repos/workers/sync-remote.ts";
import type {
  ListReposInput,
  RegisterRepoInput,
  Repo as TrpcRepoOutput,
  RepoStatusResult,
  RepoSyncResult,
} from "@fulcrum/server/trpc/schemas/repos.ts";
import type { AppContext } from "./types.ts";

type RepoSyncTaskName = typeof REPO_SYNC_LOCAL_TASK | typeof REPO_SYNC_REMOTE_TASK;
type RepoEventVerb = "repo.registered" | "repo.sync.requested" | "repo.unregistered";

export interface RepoTaskQueue {
  addJob(
    name: RepoSyncTaskName,
    payload: { repoId: string },
    options: { jobKey: string },
  ): Promise<unknown>;
}

export async function listTrpcRepos(
  em: EntityManager,
  ctx: AppContext,
  input?: ListReposInput,
): Promise<TrpcRepoOutput[]> {
  const repoRepository = repoRepo(em);
  const repos = await repoRepository.list({
    orgId: ctx.orgId,
    includeArchived: input?.includeArchived ?? false,
  });
  return repos.map(serializeTrpcRepo);
}

export async function getTrpcRepo(
  em: EntityManager,
  ctx: AppContext,
  id: string,
): Promise<TrpcRepoOutput | null> {
  const repo = await repoRepo(em).get({ orgId: ctx.orgId, id });
  return repo ? serializeTrpcRepo(repo) : null;
}

export async function registerTrpcRepo(
  em: EntityManager,
  ctx: AppContext,
  input: RegisterRepoInput,
): Promise<TrpcRepoOutput> {
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
  return serializeTrpcRepo(created);
}

export async function syncTrpcRepo(
  em: EntityManager,
  ctx: AppContext,
  repoId: string,
): Promise<TrpcRepoOutput | null> {
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
  return serializeTrpcRepo(updated);
}

export async function enqueueRepoSync(
  em: EntityManager,
  ctx: AppContext,
  repoId: string,
  queue: RepoTaskQueue,
): Promise<RepoSyncResult | null> {
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

export async function getTrpcRepoStatus(
  em: EntityManager,
  ctx: AppContext,
  repoId: string,
): Promise<RepoStatusResult | null> {
  const repo = await repoRepo(em).get({ orgId: ctx.orgId, id: repoId });
  return repo ? serializeRepoStatus(repo) : null;
}

export async function unregisterTrpcRepo(
  em: EntityManager,
  ctx: AppContext,
  repoId: string,
): Promise<TrpcRepoOutput | null> {
  const archived = await repoRepo(em).archive({ orgId: ctx.orgId, id: repoId });
  if (!archived) return null;

  await emitRepoEvent(em, ctx, {
    verb: "repo.unregistered",
    repoId: archived.id,
    payload: { slug: archived.slug },
  });
  await em.flush();
  return serializeTrpcRepo(archived);
}

export async function createRepoTask(input: {
  queue: RepoTaskQueue;
  repoId: string;
  taskName: RepoSyncTaskName;
}): Promise<RepoSyncResult> {
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

function serializeTrpcRepo(repo: Repo): TrpcRepoOutput {
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

function serializeRepoStatus(repo: Repo): RepoStatusResult {
  return {
    repoId: repo.id,
    orgId: repo.org.id,
    status: statusFromRepo(repo),
    syncStatus: repo.syncStatus,
    lastSyncAt: repo.lastSyncAt ?? null,
    lastTouchedAt: repo.lastTouchedAt ?? null,
  };
}

function statusFromRepo(repo: Repo): RepoStatusResult["status"] {
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
