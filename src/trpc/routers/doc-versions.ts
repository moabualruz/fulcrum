/**
 * Doc-versions tRPC router — schema/auth adapter over application docs service.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { appErrorToTrpcError } from "../../application/error-mapping.ts";
import { AppError } from "../../application/errors.ts";
import { restoreDocVersion } from "../../application/docs/commands.ts";
import {
  diffDocVersions,
  getDocVersion,
  listDocVersions,
} from "../../application/docs/queries.ts";
import type { AppContext, DocVersionListDto } from "../../application/docs/types.ts";
import type { TRPCContext } from "../context.ts";
import { permissionedProcedure } from "../middleware.ts";
import { t } from "../trpc.ts";

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

async function versionById(
  manager: EntityManager,
  ctx: AppContext,
  documentId: string,
  versionId: string,
): Promise<DocVersionListDto> {
  const versions = await listDocVersions(manager, ctx, documentId);
  const version = versions.find((candidate) => candidate.id === versionId);
  if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
  return version;
}

function listShape(version: DocVersionListDto) {
  return {
    id: version.id,
    versionNum: version.versionNum,
    createdAt: version.createdAt,
    authorId: version.authorId,
    authorName: null,
    isRestoreOf: null,
  };
}

export const docVersionsRouter = t.router({
  list: permissionedProcedure({ resource: "doc_versions", action: "list" })
    .input(z.object({ documentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return mapAppError(async () => {
        const versions = await listDocVersions(requireEntityManager(ctx), appContext(ctx), input.documentId);
        return versions.map(listShape);
      });
    }),

  get: permissionedProcedure({ resource: "doc_versions", action: "list" })
    .input(z.object({
      documentId: z.string().uuid(),
      versionId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      return mapAppError(async () => {
        const manager = requireEntityManager(ctx);
        const version = await versionById(manager, appContext(ctx), input.documentId, input.versionId);
        return listShape(version);
      });
    }),

  restore: permissionedProcedure({ resource: "doc_versions", action: "write" })
    .input(z.object({
      documentId: z.string().uuid(),
      versionId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      return mapAppError(async () => {
        const manager = requireEntityManager(ctx);
        const appCtx = appContext(ctx);
        const version = await versionById(manager, appCtx, input.documentId, input.versionId);
        const restored = await restoreDocVersion(manager, appCtx, input.documentId, version.versionNum);
        const versions = await listDocVersions(manager, appCtx, restored.id);
        const newVersion = versions.at(0);
        return {
          id: newVersion?.id ?? restored.id,
          versionNum: newVersion?.versionNum ?? version.versionNum,
          restoredFromVersionId: input.versionId,
        };
      });
    }),

  diff: permissionedProcedure({ resource: "doc_versions", action: "list" })
    .input(z.object({
      documentId: z.string().uuid(),
      versionId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      return mapAppError(async () => {
        const manager = requireEntityManager(ctx);
        const appCtx = appContext(ctx);
        const version = await versionById(manager, appCtx, input.documentId, input.versionId);
        if (version.versionNum <= 1) return { html: "", hasDiff: false };
        const diff = await diffDocVersions(manager, appCtx, input.documentId, version.versionNum - 1, version.versionNum);
        return { html: diff.html, hasDiff: true };
      });
    }),
});

export type DocVersionsRouter = typeof docVersionsRouter;
