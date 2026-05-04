import { basename, resolve } from "node:path";

import { TRPCError } from "@trpc/server";
import type { EntityManager } from "@mikro-orm/postgresql";
import type { Container } from "@needle-di/core";
import { z } from "zod";

import { Event } from "../../db/entities/core/Event.ts";
import { Org } from "../../db/entities/auth/Org.ts";
import { Repo } from "../../db/entities/repos/Repo.ts";
import { RepoRepository } from "../../db/repositories/repos/RepoRepository.ts";
import { protectedProcedure } from "../middleware.ts";
import { t } from "../trpc.ts";

const RepoOutputSchema = z.object({
  id: z.uuid(),
  orgId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  name: z.string(),
  slug: z.string(),
  kind: z.enum(["local", "remote"]),
  localPath: z.string().nullable(),
  remoteUrl: z.string().nullable(),
  defaultBranch: z.string().nullable(),
  currentBranch: z.string().nullable(),
  lastSyncAt: z.date().nullable(),
  syncStatus: z.string(),
  lastTouchedAt: z.date().nullable(),
  archived: z.boolean(),
});

const ListReposInputSchema = z.object({
  includeArchived: z.boolean().optional(),
}).optional();

const RepoIdInputSchema = z.object({
  id: z.uuid(),
});

const RegisterRepoInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("local"),
    path: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1).optional(),
  }),
  z.object({
    kind: z.literal("remote"),
    url: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    slug: z.string().trim().min(1).optional(),
  }),
]);

type RepoOutput = z.infer<typeof RepoOutputSchema>;

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

export const reposRouter = t.router({
  list: protectedProcedure
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

  get: protectedProcedure
    .input(RepoIdInputSchema)
    .output(RepoOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      const repo = resolveRepoRepository(ctx);
      const found = await repo.get({ orgId: ctx.orgId, id: input.id });
      return found ? serializeRepo(found) : null;
    }),

  register: protectedProcedure
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

  sync: protectedProcedure
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

  unregister: protectedProcedure
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
