import { TRPCError } from "@trpc/server";
/** Minimal DI container interface — fulfilled by needle-di Container at runtime. */
type Container = { get<T>(token: unknown): T };
import { z } from "zod";

import * as repositoryOperations from "@integration-hub/application/repos/repository-operations.ts";
import type { AppContext } from "@integration-hub/domain/repository.ts";
import { optionalTrpcEntityManager, requireTrpcEntityManager, type TRPCContext } from "../context.ts";
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
} from "../schemas/repos.ts";

function resolveRepoTaskQueue(ctx: {
  container: Container | null;
}): repositoryOperations.RepoTaskQueue {
  const token = "repoSyncQueue";
  const container = ctx.container as unknown as {
    has(token: unknown): boolean;
    get(token: unknown): unknown;
  } | null;
  if (container?.has(token)) {
    const queue = container.get(token) as Partial<repositoryOperations.RepoTaskQueue>;
    if (typeof queue.addJob === "function") return queue as repositoryOperations.RepoTaskQueue;
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Repo sync queue could not be resolved.",
  });
}

function appContext(ctx: TRPCContext): AppContext {
  return {
    orgId: ctx.orgId ?? "",
    userId: ctx.userId,
    projectId: null,
  };
}

export const reposRouter = t.router({
  list: permissionedProcedure({ resource: "repos", action: "list" })
    .input(ListReposInputSchema)
    .output(z.array(RepoOutputSchema))
    .query(async ({ ctx, input }) => {
      const em = optionalTrpcEntityManager(ctx);
      if (!em) return [];
      return repositoryOperations.listRepositories(em, appContext(ctx), input);
    }),

  get: permissionedProcedure({ resource: "repos", action: "get" })
    .input(RepoIdInputSchema)
    .output(RepoOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      return repositoryOperations.getRepository(requireTrpcEntityManager(ctx), appContext(ctx), input.id);
    }),

  register: permissionedProcedure({ resource: "repos", action: "register" })
    .input(RegisterRepoInputSchema)
    .output(RepoOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return repositoryOperations.registerRepository(requireTrpcEntityManager(ctx), appContext(ctx), input);
    }),

  sync: permissionedProcedure({ resource: "repos", action: "sync" })
    .input(RepoIdInputSchema)
    .output(RepoOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return repositoryOperations.requestRepositorySync(requireTrpcEntityManager(ctx), appContext(ctx), input.id);
    }),

  syncRepo: permissionedProcedure({ resource: "repos", action: "sync" })
    .input(SyncRepoInputSchema)
    .output(RepoSyncResultSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return repositoryOperations.enqueueRepositorySync(
        requireTrpcEntityManager(ctx),
        appContext(ctx),
        input.repoId,
        resolveRepoTaskQueue(ctx),
      );
    }),

  statusRepo: permissionedProcedure({ resource: "repos", action: "status" })
    .input(SyncRepoInputSchema)
    .output(RepoStatusResultSchema.nullable())
    .query(async ({ ctx, input }) => {
      return repositoryOperations.getRepositoryStatus(requireTrpcEntityManager(ctx), appContext(ctx), input.repoId);
    }),

  unregister: permissionedProcedure({ resource: "repos", action: "unregister" })
    .input(RepoIdInputSchema)
    .output(RepoOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return repositoryOperations.unregisterRepository(requireTrpcEntityManager(ctx), appContext(ctx), input.id);
    }),
});

export type ReposRouter = typeof reposRouter;
