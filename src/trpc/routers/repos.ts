import { TRPCError } from "@trpc/server";
import type { Container } from "@needle-di/core";
import { z } from "zod";

import * as repoApplication from "../../application/repos/trpc-adapter.ts";
import type { AppContext } from "../../application/repos/types.ts";
import { requireTrpcEntityManager, type TRPCContext } from "../context.ts";
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
}): repoApplication.RepoTaskQueue {
  const token = "repoSyncQueue";
  const container = ctx.container as unknown as {
    has(token: unknown): boolean;
    get(token: unknown): unknown;
  } | null;
  if (container?.has(token)) {
    const queue = container.get(token) as Partial<repoApplication.RepoTaskQueue>;
    if (typeof queue.addJob === "function") return queue as repoApplication.RepoTaskQueue;
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
      return repoApplication.listTrpcRepos(requireTrpcEntityManager(ctx), appContext(ctx), input);
    }),

  get: permissionedProcedure({ resource: "repos", action: "get" })
    .input(RepoIdInputSchema)
    .output(RepoOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      return repoApplication.getTrpcRepo(requireTrpcEntityManager(ctx), appContext(ctx), input.id);
    }),

  register: permissionedProcedure({ resource: "repos", action: "register" })
    .input(RegisterRepoInputSchema)
    .output(RepoOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return repoApplication.registerTrpcRepo(requireTrpcEntityManager(ctx), appContext(ctx), input);
    }),

  sync: permissionedProcedure({ resource: "repos", action: "sync" })
    .input(RepoIdInputSchema)
    .output(RepoOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return repoApplication.syncTrpcRepo(requireTrpcEntityManager(ctx), appContext(ctx), input.id);
    }),

  syncRepo: permissionedProcedure({ resource: "repos", action: "sync" })
    .input(SyncRepoInputSchema)
    .output(RepoSyncResultSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return repoApplication.enqueueRepoSync(
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
      return repoApplication.getTrpcRepoStatus(requireTrpcEntityManager(ctx), appContext(ctx), input.repoId);
    }),

  unregister: permissionedProcedure({ resource: "repos", action: "unregister" })
    .input(RepoIdInputSchema)
    .output(RepoOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return repoApplication.unregisterTrpcRepo(requireTrpcEntityManager(ctx), appContext(ctx), input.id);
    }),
});

export type ReposRouter = typeof reposRouter;
