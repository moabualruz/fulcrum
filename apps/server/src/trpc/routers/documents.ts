/**
 * Documents tRPC router — legacy mount-compatible adapter over application docs service.
 */

import type { EntityManager } from "@mikro-orm/postgresql";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { appErrorToTrpcError } from "@/application/error-mapping.ts";
import { AppError } from "@/application/errors.ts";
import {
  createDoc,
  deleteDoc,
  updateDoc,
} from "@/application/docs/commands.ts";
import {
  getDoc,
  listDocs,
} from "@/application/docs/queries.ts";
import type { AppContext, DocDto } from "@/application/docs/types.ts";
import type { TRPCContext } from "../context.ts";
import { permissionedProcedure } from "../middleware.ts";
import { t } from "../trpc.ts";

const DocTypeSchema = z.enum([
  "spec",
  "adr",
  "wiki",
  "runbook",
  "meeting",
  "postmortem",
  "rfc",
  "note",
  "scratch",
]);

const ContentJsonSchema = z.record(z.string(), z.unknown());
const FrontmatterSchema = z.record(z.string(), z.unknown()).optional();

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

function bodyFromContentJson(contentJson: Record<string, unknown>): string {
  if (typeof contentJson["text"] === "string") return contentJson["text"];
  const content = contentJson["content"];
  if (!Array.isArray(content)) return "";
  return content
    .map((child) => typeof child === "object" && child !== null ? bodyFromContentJson(child as Record<string, unknown>) : "")
    .filter(Boolean)
    .join(" ");
}

function sortLegacyDocs(docs: DocDto[]): DocDto[] {
  return [...docs].sort((left, right) =>
    left.sortPosition - right.sortPosition
    || right.updatedAt.getTime() - left.updatedAt.getTime()
    || left.id.localeCompare(right.id)
  );
}

export const documentsRouter = t.router({
  list: permissionedProcedure({ resource: "documents", action: "list" })
    .input(
      z.object({
        projectId: z.string().uuid().optional(),
        docType: DocTypeSchema.optional(),
        archived: z.boolean().optional().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      return mapAppError(async () => {
        const docs = await listDocs(requireEntityManager(ctx), appContext(ctx), {
          docType: input.docType,
          archived: input.archived,
          limit: 100,
        });
        return sortLegacyDocs(input.projectId ? docs.filter((doc) => doc.projectId === input.projectId) : docs);
      });
    }),

  get: permissionedProcedure({ resource: "documents", action: "read" })
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return mapAppError(() => getDoc(requireEntityManager(ctx), appContext(ctx), input.id));
    }),

  create: permissionedProcedure({ resource: "documents", action: "write" })
    .input(
      z.object({
        title: z.string().min(1).max(500),
        docType: DocTypeSchema.default("note"),
        projectId: z.string().uuid().optional(),
        parentId: z.string().uuid().optional(),
        sortPosition: z.number().optional().default(0),
        contentJson: ContentJsonSchema.optional().default({}),
        frontmatter: FrontmatterSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() =>
        createDoc(requireEntityManager(ctx), appContext(ctx), {
          title: input.title,
          docType: input.docType,
          projectId: input.projectId ?? null,
          parentId: input.parentId ?? null,
          sortPosition: input.sortPosition,
          contentJson: input.contentJson,
          frontmatter: input.frontmatter ?? {},
          bodyMd: bodyFromContentJson(input.contentJson),
        })
      );
    }),

  update: permissionedProcedure({ resource: "documents", action: "write" })
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).max(500).optional(),
        contentJson: ContentJsonSchema.optional(),
        frontmatter: FrontmatterSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() =>
        updateDoc(requireEntityManager(ctx), appContext(ctx), {
          id: input.id,
          title: input.title,
          contentJson: input.contentJson,
          bodyMd: input.contentJson ? bodyFromContentJson(input.contentJson) : undefined,
          frontmatter: input.frontmatter,
        })
      );
    }),

  updatePosition: permissionedProcedure({ resource: "documents", action: "write" })
    .input(
      z.object({
        id: z.string().uuid(),
        parentId: z.string().uuid().nullable().optional(),
        sortPosition: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() =>
        updateDoc(requireEntityManager(ctx), appContext(ctx), {
          id: input.id,
          parentId: input.parentId,
          sortPosition: input.sortPosition,
        })
      );
    }),

  delete: permissionedProcedure({ resource: "documents", action: "write" })
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await mapAppError(() => deleteDoc(requireEntityManager(ctx), appContext(ctx), input.id, false));
      return { id: input.id, archived: true };
    }),
});

export type DocumentsRouter = typeof documentsRouter;
