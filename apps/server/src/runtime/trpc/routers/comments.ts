/**
 * commentsRouter — task workflow
 *
 * Thin tRPC delegation layer for comments, watchers, and reactions.
 * All business logic lives in WorkItemCommentService.
 *
 * Security:
 *   T-05-05: userId comes from ctx.userId (authenticated context), never from input.
 *   T-05-07: orgId comes from ctx.orgId, enforcing org-scope isolation.
 *
 * NOTE: This router is NOT yet wired into apps/server/src/trpc/router.ts.
 *       workflow milestone owns that file exclusively (HIGH-06 fix).
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  addTaskCommentReaction,
  createTaskComment,
  deleteTaskComment,
  removeTaskCommentReaction,
  resolveTaskComment,
  subscribeTaskComment,
  unresolveTaskComment,
  unsubscribeTaskComment,
} from "@work-management/application/comments/commands.ts";
import {
  getThreadedTaskComments,
  listTaskComments,
  listTaskCommentWatchers,
} from "@work-management/application/comments/queries.ts";
import type { AppContext } from "@work-management/application/comments/types.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

// ── Helpers ────────────────────────────────────────────────────────

type EntityManager = import("@mikro-orm/postgresql").EntityManager;

function requireEntityManager(ctx: Record<string, unknown>): EntityManager {
  const em = ctx["em"] as EntityManager | null | undefined;
  if (em) return em;
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "EntityManager could not be resolved for comments.",
  });
}

function appContext(ctx: { orgId: string; userId: string }): AppContext {
  return { orgId: ctx.orgId, userId: ctx.userId };
}

// ── Router ─────────────────────────────────────────────────────────

export const commentsRouter = t.router({
  // ── Comment queries ──────────────────────────────────────────

  list: permissionedProcedure({ resource: "comments", action: "list" })
    .input(z.object({ taskId: z.string().uuid() }))
    .query(({ ctx, input }) => {
      return listTaskComments(requireEntityManager(ctx), appContext(ctx), input.taskId);
    }),

  threaded: permissionedProcedure({ resource: "comments", action: "list" })
    .input(z.object({ taskId: z.string().uuid() }))
    .query(({ ctx, input }) => {
      return getThreadedTaskComments(requireEntityManager(ctx), appContext(ctx), input.taskId);
    }),

  // ── Comment mutations ────────────────────────────────────────

  create: permissionedProcedure({ resource: "comments", action: "create" })
    .input(
      z.object({
        taskId: z.string().uuid(),
        body: z.record(z.string(), z.unknown()),
        parentCommentId: z.string().uuid().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      return createTaskComment(requireEntityManager(ctx), appContext(ctx), input);
    }),

  delete: permissionedProcedure({ resource: "comments", action: "delete" })
    .input(z.object({ commentId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      return deleteTaskComment(requireEntityManager(ctx), appContext(ctx), input.commentId);
    }),

  resolve: permissionedProcedure({ resource: "comments", action: "update" })
    .input(z.object({ commentId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      return resolveTaskComment(requireEntityManager(ctx), appContext(ctx), input.commentId);
    }),

  unresolve: permissionedProcedure({ resource: "comments", action: "update" })
    .input(z.object({ commentId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      return unresolveTaskComment(requireEntityManager(ctx), appContext(ctx), input.commentId);
    }),

  // ── Reaction mutations ───────────────────────────────────────

  addReaction: permissionedProcedure({ resource: "comments", action: "update" })
    .input(z.object({ commentId: z.string().uuid(), emoji: z.string().max(8) }))
    .mutation(({ ctx, input }) => {
      return addTaskCommentReaction(requireEntityManager(ctx), appContext(ctx), input.commentId, input.emoji);
    }),

  removeReaction: permissionedProcedure({ resource: "comments", action: "update" })
    .input(z.object({ commentId: z.string().uuid(), emoji: z.string().max(8) }))
    .mutation(({ ctx, input }) => {
      return removeTaskCommentReaction(requireEntityManager(ctx), appContext(ctx), input.commentId, input.emoji);
    }),

  // ── Watcher procedures ───────────────────────────────────────

  watchers: permissionedProcedure({ resource: "comments", action: "list" })
    .input(z.object({ taskId: z.string().uuid() }))
    .query(({ ctx, input }) => {
      return listTaskCommentWatchers(requireEntityManager(ctx), appContext(ctx), input.taskId);
    }),

  subscribe: permissionedProcedure({ resource: "comments", action: "create" })
    .input(z.object({ taskId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      return subscribeTaskComment(requireEntityManager(ctx), appContext(ctx), input.taskId);
    }),

  unsubscribe: permissionedProcedure({ resource: "comments", action: "delete" })
    .input(z.object({ taskId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      return unsubscribeTaskComment(requireEntityManager(ctx), appContext(ctx), input.taskId);
    }),
});
