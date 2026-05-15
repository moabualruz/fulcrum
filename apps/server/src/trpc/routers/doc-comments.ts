/**
 * Doc-comments tRPC router — schema/auth adapter over application docs service.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { appErrorToTrpcError } from "@fulcrum/server/trpc/error-mapping.ts";
import { AppError } from "@platform-core/domain/errors.ts";
import {
  createDocComment,
  deleteDocComment,
  resolveDocComment,
  updateDocComment,
} from "@knowledge-workspace/application/docs/commands.ts";
import { listDocComments } from "@knowledge-workspace/application/docs/queries.ts";
import type { AppContext } from "@knowledge-workspace/application/docs/types.ts";
import type { TRPCContext } from "../context.ts";
import { permissionedProcedure } from "../middleware.ts";
import { t } from "../trpc.ts";

const CommentAnchorSchema = z.record(z.string(), z.unknown());

function requireEntityManager(ctx: Record<string, unknown>): EntityManager {
  const manager = ctx["em"] as EntityManager | null | undefined;
  if (manager) return manager;
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database connection" });
}

function appContext(ctx: TRPCContext): AppContext {
  if (!ctx.orgId) throw new TRPCError({ code: "UNAUTHORIZED", message: "No org context" });
  return { orgId: ctx.orgId, userId: ctx.userId, projectId: null };
}

async function mapAppError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

export const docCommentsRouter = t.router({
  list: permissionedProcedure({ resource: "doc_comments", action: "list" })
    .input(
      z.object({
        docId: z.string().uuid(),
        includeResolved: z.boolean().optional().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      return mapAppError(async () => {
        const manager = requireEntityManager(ctx);
        const unresolved = await listDocComments(manager, appContext(ctx), input.docId, false);
        if (!input.includeResolved) return unresolved;
        const resolved = await listDocComments(manager, appContext(ctx), input.docId, true);
        return [...unresolved, ...resolved].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      });
    }),

  create: permissionedProcedure({ resource: "doc_comments", action: "write" })
    .input(
      z.object({
        docId: z.string().uuid(),
        bodyMd: z.string().min(1).max(10_000),
        anchorRange: CommentAnchorSchema.optional(),
        parentCommentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() =>
        createDocComment(requireEntityManager(ctx), appContext(ctx), {
          docId: input.docId,
          bodyMd: input.bodyMd,
          anchorRange: input.anchorRange ?? null,
          parentCommentId: input.parentCommentId ?? null,
        })
      );
    }),

  update: permissionedProcedure({ resource: "doc_comments", action: "write" })
    .input(
      z.object({
        id: z.string().uuid(),
        bodyMd: z.string().min(1).max(10_000).optional(),
        anchorRange: CommentAnchorSchema.nullable().optional(),
        resolved: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.anchorRange !== undefined && input.bodyMd === undefined && input.resolved === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Comment anchor-only updates are not available through the application docs service.",
        });
      }
      return mapAppError(async () => {
        const manager = requireEntityManager(ctx);
        let comment = input.bodyMd !== undefined
          ? await updateDocComment(manager, appContext(ctx), input.id, input.bodyMd)
          : null;
        if (input.resolved !== undefined) {
          comment = await resolveDocComment(manager, appContext(ctx), input.id, input.resolved);
        }
        return comment;
      });
    }),

  resolve: permissionedProcedure({ resource: "doc_comments", action: "write" })
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => resolveDocComment(requireEntityManager(ctx), appContext(ctx), input.id, true));
    }),

  delete: permissionedProcedure({ resource: "doc_comments", action: "write" })
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await mapAppError(() => deleteDocComment(requireEntityManager(ctx), appContext(ctx), input.id));
      return { id: input.id, deleted: Boolean(deleted?.deleted) };
    }),
});

export type DocCommentsRouter = typeof docCommentsRouter;
