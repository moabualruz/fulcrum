import { basename, resolve } from "node:path";

import { TRPCError } from "@trpc/server";
import type { EntityManager } from "@mikro-orm/postgresql";
import type { Container } from "@needle-di/core";
import { z } from "zod";

import { Event } from "../../db/entities/core/Event.ts";
import { Org } from "../../db/entities/auth/Org.ts";
import { Repo } from "../../db/entities/repos/Repo.ts";
import { RepoRepository } from "../../db/repositories/repos/RepoRepository.ts";
import { REPO_SYNC_LOCAL_TASK } from "../../repos/workers/sync-local.ts";
import { REPO_SYNC_REMOTE_TASK } from "../../repos/workers/sync-remote.ts";
import { permissionedProcedure } from "../middleware.ts";
import { t } from "../trpc.ts";
import {
  ListReposInputSchema,
  RegisterRepoInputSchema,
  RepoIdInputSchema,
  RepoSchema as RepoOutputSchema,
  RepoStatusResultSchema,
  RepoSyncResultSchema,
  SyncRepoInputSchema,
  type RepoStatusResult,
  type RepoSyncResult,
} from "../schemas/repos.ts";

type RepoOutput = z.infer<typeof RepoOutputSchema>;
type RepoSyncTaskName = typeof REPO_SYNC_LOCAL_TASK | typeof REPO_SYNC_REMOTE_TASK;

interface RepoTaskQueue {
  addJob(
    name: RepoSyncTaskName,
    payload: { repoId: string },
    options: { jobKey: string },
  ): Promise<unknown>;
}

function serializeRepo(repo: Repo): RepoOutput {
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

function resolveRepoRepository(ctx: {
  container: Container | null;
  em: EntityManager | null;
}): RepoRepository {
  if (ctx.container?.has(RepoRepository)) {
    return ctx.container.get(RepoRepository);
  }

  if (ctx.em) {
    return ctx.em.getRepository(Repo) as RepoRepository;
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "RepoRepository could not be resolved.",
  });
}

function resolveRepoTaskQueue(ctx: {
  container: Container | null;
}): RepoTaskQueue {
  const token = "repoSyncQueue";
  const container = ctx.container as unknown as {
    has(token: unknown): boolean;
    get(token: unknown): unknown;
  } | null;
  if (container?.has(token)) {
    const queue = container.get(token) as Partial<RepoTaskQueue>;
    if (typeof queue.addJob === "function") return queue as RepoTaskQueue;
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Repo sync queue could not be resolved.",
  });
}

function slugFromRemoteUrl(url: string): string {
  const withoutTrailingSlash = url.replace(/\/$/, "");
  const lastSegment = withoutTrailingSlash.split(/[/:]/).filter(Boolean).at(-1) ?? "repo";
  return lastSegment.replace(/\.git$/, "") || "repo";
}

async function emitRepoEvent(ctx: {
  orgId: string;
  userId: string | null;
  em: EntityManager | null;
}, input: {
  verb: "repo.registered" | "repo.sync.requested" | "repo.unregistered";
  repoId: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  if (!ctx.em) return;

  const event = ctx.em.create(Event, {
    org: ctx.em.getReference(Org, ctx.orgId),
    verb: input.verb,
    subjectKind: "repo",
    subjectId: input.repoId,
    payload: input.payload ?? {},
    createdAt: new Date(),
  });
  ctx.em.persist(event);
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

function repoSyncTaskName(repo: Repo): RepoSyncTaskName {
  return repo.kind === "local" ? REPO_SYNC_LOCAL_TASK : REPO_SYNC_REMOTE_TASK;
}

function statusFromRepo(repo: Repo): RepoStatusResult["status"] {
  if (repo.syncStatus === "error" || repo.syncStatus === "failed") return "failed";
  if (repo.syncStatus === "syncing" || repo.syncStatus === "running") return "running";
  if (!repo.lastSyncAt) return "stale";

  const staleAfterMs = 30 * 60 * 1_000;
  return Date.now() - repo.lastSyncAt.getTime() > staleAfterMs ? "stale" : "synced";
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

export const reposRouter = t.router({
  list: permissionedProcedure({ resource: "repos", action: "list" })
    .input(ListReposInputSchema)
    .output(z.array(RepoOutputSchema))
    .query(async ({ ctx, input }) => {
      if (!ctx.container && !ctx.em) return [];
      const repo = resolveRepoRepository(ctx);
      const repos = await repo.list({
        orgId: ctx.orgId,
        includeArchived: input?.includeArchived ?? false,
      });
      return repos.map(serializeRepo);
    }),

  get: permissionedProcedure({ resource: "repos", action: "get" })
    .input(RepoIdInputSchema)
    .output(RepoOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      const repo = resolveRepoRepository(ctx);
      const found = await repo.get({ orgId: ctx.orgId, id: input.id });
      return found ? serializeRepo(found) : null;
    }),

  register: permissionedProcedure({ resource: "repos", action: "register" })
    .input(RegisterRepoInputSchema)
    .output(RepoOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const repo = resolveRepoRepository(ctx);
      const created = input.kind === "local"
        ? repo.create({
          orgId: ctx.orgId,
          name: input.name ?? basename(resolve(input.path)),
          slug: input.slug ?? basename(resolve(input.path)),
          kind: "local",
          localPath: resolve(input.path),
        })
        : repo.create({
          orgId: ctx.orgId,
          name: input.name ?? slugFromRemoteUrl(input.url),
          slug: input.slug ?? slugFromRemoteUrl(input.url),
          kind: "remote",
          remoteUrl: input.url,
        });

      await emitRepoEvent(ctx, {
        verb: "repo.registered",
        repoId: created.id,
        payload: { kind: created.kind, slug: created.slug },
      });
      await repo.getEntityManager().flush();
      return serializeRepo(created);
    }),

  sync: permissionedProcedure({ resource: "repos", action: "sync" })
    .input(RepoIdInputSchema)
    .output(RepoOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const repo = resolveRepoRepository(ctx);
      const found = await repo.update({
        orgId: ctx.orgId,
        id: input.id,
        syncStatus: "syncing",
      });
      if (!found) return null;

      await emitRepoEvent(ctx, {
        verb: "repo.sync.requested",
        repoId: found.id,
        payload: { kind: found.kind },
      });
      await repo.getEntityManager().flush();
      return serializeRepo(found);
    }),

  syncRepo: permissionedProcedure({ resource: "repos", action: "sync" })
    .input(SyncRepoInputSchema)
    .output(RepoSyncResultSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const repo = resolveRepoRepository(ctx);
      const found = await repo.get({ orgId: ctx.orgId, id: input.repoId });
      if (!found) return null;

      const result = await createRepoTask({
        queue: resolveRepoTaskQueue(ctx),
        repoId: found.id,
        taskName: repoSyncTaskName(found),
      });
      await repo.update({
        orgId: ctx.orgId,
        id: found.id,
        syncStatus: "syncing",
      });
      await emitRepoEvent(ctx, {
        verb: "repo.sync.requested",
        repoId: found.id,
        payload: { kind: found.kind, taskName: result.taskName, jobKey: result.jobKey },
      });
      await repo.getEntityManager().flush();
      return result;
    }),

  statusRepo: permissionedProcedure({ resource: "repos", action: "status" })
    .input(SyncRepoInputSchema)
    .output(RepoStatusResultSchema.nullable())
    .query(async ({ ctx, input }) => {
      const repo = resolveRepoRepository(ctx);
      const found = await repo.get({ orgId: ctx.orgId, id: input.repoId });
      return found ? serializeRepoStatus(found) : null;
    }),

  unregister: permissionedProcedure({ resource: "repos", action: "unregister" })
    .input(RepoIdInputSchema)
    .output(RepoOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const repo = resolveRepoRepository(ctx);
      const archived = await repo.archive({ orgId: ctx.orgId, id: input.id });
      if (!archived) return null;

      await emitRepoEvent(ctx, {
        verb: "repo.unregistered",
        repoId: archived.id,
        payload: { slug: archived.slug },
      });
      await repo.getEntityManager().flush();
      return serializeRepo(archived);
    }),
});

export type ReposRouter = typeof reposRouter;
