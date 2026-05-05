/**
 * commentsRouter — Phase 05 Plan 03
 *
 * Thin tRPC delegation layer for comments, watchers, and reactions.
 * All business logic lives in CommentService.
 *
 * Security:
 *   T-05-05: userId comes from ctx.userId (authenticated context), never from input.
 *   T-05-07: orgId comes from ctx.orgId, enforcing org-scope isolation.
 *
 * NOTE: This router is NOT yet wired into src/trpc/router.ts.
 *       Plan 06 owns that file exclusively (HIGH-06 fix).
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { CommentService } from "../../../services/CommentService.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

// ── Helpers ────────────────────────────────────────────────────────

type ResolveCtx = {
  em: import("@mikro-orm/postgresql").EntityManager | null;
  container: import("@needle-di/core").Container | null;
};

function resolveService(ctx: ResolveCtx): CommentService {
  if (ctx.em) return new CommentService(ctx.em);
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "CommentService could not be resolved: no EntityManager in context.",
  });
}

// ── Router ─────────────────────────────────────────────────────────

export const commentsRouter = t.router({
  // ── Comment queries ──────────────────────────────────────────

  list: permissionedProcedure({ resource: "comments", action: "list" })
    .input(z.object({ taskId: z.string().uuid() }))
    .query(({ ctx, input }) => {
      return resolveService(ctx).listComments(ctx.orgId, input.taskId);
    }),

  threaded: permissionedProcedure({ resource: "comments", action: "list" })
    .input(z.object({ taskId: z.string().uuid() }))
    .query(({ ctx, input }) => {
      return resolveService(ctx).getThreaded(ctx.orgId, input.taskId);
    }),

  // ── Comment mutations ────────────────────────────────────────

  create: permissionedProcedure({ resource: "comments", action: "create" })
    .input(
      z.object({
        taskId: z.string().uuid(),
        body: z.record(z.unknown()),
        parentCommentId: z.string().uuid().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      // T-05-05: authorId from ctx.userId, not user input
      return resolveService(ctx).createComment(
        ctx.orgId,
        input.taskId,
        ctx.userId,
        input.body,
        input.parentCommentId,
      );
    }),

  delete: permissionedProcedure({ resource: "comments", action: "delete" })
    .input(z.object({ commentId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      return resolveService(ctx).deleteComment(ctx.orgId, input.commentId);
    }),

  resolve: permissionedProcedure({ resource: "comments", action: "update" })
    .input(z.object({ commentId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      return resolveService(ctx).resolveComment(ctx.orgId, input.commentId, ctx.userId);
    }),

  unresolve: permissionedProcedure({ resource: "comments", action: "update" })
    .input(z.object({ commentId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      return resolveService(ctx).unresolveComment(ctx.orgId, input.commentId);
    }),

  // ── Reaction mutations ───────────────────────────────────────

  addReaction: permissionedProcedure({ resource: "comments", action: "update" })
    .input(z.object({ commentId: z.string().uuid(), emoji: z.string().max(8) }))
    .mutation(({ ctx, input }) => {
      return resolveService(ctx).addReaction(input.commentId, ctx.userId, input.emoji);
    }),

  removeReaction: permissionedProcedure({ resource: "comments", action: "update" })
    .input(z.object({ commentId: z.string().uuid(), emoji: z.string().max(8) }))
    .mutation(({ ctx, input }) => {
      return resolveService(ctx).removeReaction(input.commentId, ctx.userId, input.emoji);
    }),

  // ── Watcher procedures ───────────────────────────────────────

  watchers: permissionedProcedure({ resource: "comments", action: "list" })
    .input(z.object({ taskId: z.string().uuid() }))
    .query(({ ctx, input }) => {
      return resolveService(ctx).listWatchers(ctx.orgId, input.taskId);
    }),

  subscribe: permissionedProcedure({ resource: "comments", action: "create" })
    .input(z.object({ taskId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      return resolveService(ctx).subscribe(ctx.orgId, input.taskId, ctx.userId, "manual");
    }),

  unsubscribe: permissionedProcedure({ resource: "comments", action: "delete" })
    .input(z.object({ taskId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      return resolveService(ctx).unsubscribe(ctx.orgId, input.taskId, ctx.userId);
    }),
});
