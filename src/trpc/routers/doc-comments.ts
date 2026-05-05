/**
 * Doc-comments tRPC router — anchored comment threads.
 *
 * Threat mitigations:
 *   T-06-12: author set from authenticated session user, never from client input.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";
import type { TRPCContext } from "../context.ts";
import type { DocComment } from "../../db/entities/docs/DocComment.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getEm(ctx: TRPCContext) {
  if (!ctx.em) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database connection" });
  }
  return ctx.em;
}

function requireOrg(ctx: TRPCContext): string {
  if (!ctx.orgId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "No org context" });
  }
  return ctx.orgId;
}

async function resolveComment(ctx: TRPCContext, id: string): Promise<DocComment> {
  const em = getEm(ctx);
  const orgId = requireOrg(ctx);
  const comment = await em.findOne("DocComment" as never, { id, org: orgId } as never) as DocComment | null;
  if (!comment) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
  }
  return comment;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const docCommentsRouter = t.router({
  /** List comments for a document including thread parents. */
  list: permissionedProcedure({ resource: "doc_comments", action: "list" })
    .input(
      z.object({
        docId: z.string().uuid(),
        includeResolved: z.boolean().optional().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const em = getEm(ctx);
      const orgId = requireOrg(ctx);

      const where: Record<string, unknown> = { org: orgId, doc: input.docId };
      if (!input.includeResolved) where["resolved"] = false;

      return em.find("DocComment" as never, where as never, {
        orderBy: { createdAt: "ASC" } as never,
        populate: ["author", "parentComment"] as never,
      }) as Promise<DocComment[]>;
    }),

  /** Create a comment with optional anchor range and thread parent. */
  create: permissionedProcedure({ resource: "doc_comments", action: "write" })
    .input(
      z.object({
        docId: z.string().uuid(),
        bodyMd: z.string().min(1).max(10_000),
        /** Serialized anchor range (e.g. {from, to} or {nodeId, offset}) */
        anchorRange: z.record(z.string(), z.unknown()).optional(),
        /** Parent comment id for threading */
        parentCommentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const em = getEm(ctx);
      const orgId = requireOrg(ctx);

      // T-06-12: author from session, never client input
      const authorId = ctx.userId ?? null;

      const comment = em.create("DocComment" as never, {
        org: orgId,
        doc: input.docId,
        bodyMd: input.bodyMd,
        anchorRange: input.anchorRange ?? null,
        author: authorId,
        parentComment: input.parentCommentId ?? null,
        resolved: false,
      } as never) as DocComment;

      em.persist(comment as never);
      await em.flush();
      return comment;
    }),

  /** Mark a comment as resolved. */
  resolve: permissionedProcedure({ resource: "doc_comments", action: "write" })
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const em = getEm(ctx);
      const comment = await resolveComment(ctx, input.id);

      (comment as unknown as Record<string, unknown>)["resolved"] = true;
      await em.flush();
      return { id: input.id, resolved: true };
    }),

  /** Delete a comment (hard delete). */
  delete: permissionedProcedure({ resource: "doc_comments", action: "write" })
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const em = getEm(ctx);
      const comment = await resolveComment(ctx, input.id);

      em.remove(comment as never);
      await em.flush();
      return { id: input.id, deleted: true };
    }),
});

export type DocCommentsRouter = typeof docCommentsRouter;
