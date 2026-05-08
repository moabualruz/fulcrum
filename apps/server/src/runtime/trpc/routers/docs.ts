import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createDoc,
  createDocComment,
  deleteDoc,
  deleteDocComment,
  resolveDocComment,
  restoreDocVersion,
  updateDoc,
  updateDocComment,
} from "@/application/docs/commands.ts";
import {
  diffDocVersions,
  getDoc,
  getDocVersion,
  listDocBacklinks,
  listDocComments,
  listDocForwardLinks,
  listDocs,
  listDocVersions,
} from "@/application/docs/queries.ts";
import type { AppContext } from "@/application/docs/types.ts";
import { DocTypeEnum, ScopeEnum } from "@/application/docs/types.ts";
import { LinkKindEnum } from "@/domain/docs/enums.ts";
import { appErrorToTrpcError } from "@/application/error-mapping.ts";
import { AppError } from "@/application/errors.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { docTemplatesRouter } from "./doc-templates.ts";

// ── Schemas ────────────────────────────────────────────────────────

const JsonRecordSchema = z.record(z.string(), z.unknown());

const DocOutputSchema = z.object({
  id: z.uuid(),
  orgId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  title: z.string(),
  slug: z.string(),
  parentId: z.uuid().nullable(),
  projectId: z.uuid().nullable(),
  scope: ScopeEnum,
  docType: DocTypeEnum,
  frontmatter: JsonRecordSchema,
  bodyMd: z.string(),
  contentJson: JsonRecordSchema,
  sortPosition: z.number(),
  archived: z.boolean(),
  externalId: z.string().nullable(),
  updatedAt: z.date(),
});

const ListDocsInputSchema = z.object({
  scope: ScopeEnum.optional(),
  docType: DocTypeEnum.optional(),
  archived: z.boolean().optional(),
  parentId: z.uuid().nullable().optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().nonnegative().optional(),
}).optional();

const GetDocInputSchema = z.union([
  z.object({ id: z.uuid(), slug: z.string().optional() }),
  z.object({ slug: z.string().min(1), id: z.uuid().optional() }),
]);

const CreateDocInputSchema = z.object({
  title: z.string().trim().min(1),
  parentId: z.uuid().nullable().optional(),
  projectId: z.uuid().nullable().optional(),
  scope: ScopeEnum.optional(),
  docType: DocTypeEnum.optional(),
  frontmatter: JsonRecordSchema.optional(),
  bodyMd: z.string().optional(),
  contentJson: JsonRecordSchema.optional(),
  sortPosition: z.number().optional(),
  source: z.object({ kind: z.string().min(1), id: z.string().min(1) }).optional(),
  links: z.array(z.object({
    targetKind: z.string().min(1),
    targetId: z.string().min(1),
    linkKind: LinkKindEnum.optional(),
  })).optional(),
});

const UpdateDocInputSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).optional(),
  parentId: z.uuid().nullable().optional(),
  projectId: z.uuid().nullable().optional(),
  scope: ScopeEnum.optional(),
  docType: DocTypeEnum.optional(),
  frontmatter: JsonRecordSchema.optional(),
  bodyMd: z.string().optional(),
  contentJson: JsonRecordSchema.optional(),
  sortPosition: z.number().optional(),
  archived: z.boolean().optional(),
}).refine((input) => Object.keys(input).length > 1, {
  message: "Update must include at least one field.",
});

const DeleteDocInputSchema = z.object({
  id: z.uuid(),
  hard: z.boolean().optional(),
});

const HardDeleteOutputSchema = z.object({ deleted: z.literal(true) });
const DocLinksInputSchema = z.object({ docId: z.uuid() });
const BacklinkOutputSchema = z.object({
  fromDocId: z.uuid(),
  title: z.string(),
  slug: z.string(),
  linkKind: z.literal("wikilink"),
});
const ForwardLinkOutputSchema = z.object({
  toDocId: z.uuid().nullable(),
  toSlug: z.string(),
  linkKind: z.literal("wikilink"),
});
const CommentAnchorSchema = z.record(z.string(), z.unknown());
const CommentReplyOutputSchema = z.object({
  id: z.uuid(),
  orgId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  docId: z.uuid(),
  anchorRange: CommentAnchorSchema.nullable(),
  authorId: z.uuid().nullable(),
  bodyMd: z.string(),
  parentCommentId: z.uuid().nullable(),
  resolved: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  replies: z.array(z.never()),
});
const CommentOutputSchema = z.object({
  id: z.uuid(),
  orgId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  docId: z.uuid(),
  anchorRange: CommentAnchorSchema.nullable(),
  authorId: z.uuid().nullable(),
  bodyMd: z.string(),
  parentCommentId: z.uuid().nullable(),
  resolved: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  replies: z.array(CommentReplyOutputSchema),
});
const ListCommentsInputSchema = z.object({
  docId: z.uuid(),
  resolved: z.boolean().optional(),
});
const CreateCommentInputSchema = z.object({
  docId: z.uuid(),
  anchorRange: CommentAnchorSchema.nullable().optional(),
  bodyMd: z.string().trim().min(1),
  parentCommentId: z.uuid().nullable().optional(),
});
const UpdateCommentInputSchema = z.object({
  id: z.uuid(),
  bodyMd: z.string().trim().min(1),
});
const DeleteCommentInputSchema = z.object({ id: z.uuid() });
const ResolveCommentInputSchema = z.object({
  id: z.uuid(),
  resolved: z.boolean().default(true),
});
const DeleteCommentOutputSchema = z.object({ deleted: z.literal(true) });
const VersionDocInputSchema = z.object({ docId: z.uuid() });
const VersionGetInputSchema = VersionDocInputSchema.extend({ versionNum: z.number().int().positive() });
const VersionDiffInputSchema = VersionDocInputSchema.extend({
  fromVersionNum: z.number().int().positive(),
  toVersionNum: z.number().int().positive(),
});
const VersionListOutputSchema = z.object({
  id: z.uuid(),
  versionNum: z.number().int().positive(),
  isSnapshot: z.boolean(),
  authorId: z.uuid().nullable(),
  createdAt: z.date(),
});
const VersionOutputSchema = VersionListOutputSchema.extend({
  bodyMdSnapshot: z.string().nullable(),
  restoreOfId: z.uuid().nullable(),
});
const VersionDiffOutputSchema = z.object({ html: z.string() });

// ── Helpers ────────────────────────────────────────────────────────

type EntityManager = import("@mikro-orm/postgresql").EntityManager;

function requireEntityManager(ctx: Record<string, unknown>): EntityManager {
  const em = ctx["em"] as EntityManager | null | undefined;
  if (!em) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "EntityManager is not available." });
  }
  return em;
}

function optionalEntityManager(ctx: Record<string, unknown>): EntityManager | null {
  return (ctx["em"] as EntityManager | null | undefined) ?? null;
}

function appContext(ctx: { orgId: string; userId: string }): AppContext {
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

// ── Router (thin delegation layer) ─────────────────────────────────

export const docsRouter = t.router({
  list: permissionedProcedure({ resource: "docs", action: "list" })
    .input(ListDocsInputSchema)
    .output(z.array(DocOutputSchema))
    .query(async ({ ctx, input }) => {
      const em = optionalEntityManager(ctx);
      if (!em) return [];
      return mapAppError(() => listDocs(em, appContext(ctx), input ?? undefined));
    }),

  get: permissionedProcedure({ resource: "docs", action: "get" })
    .input(GetDocInputSchema)
    .output(DocOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      const em = optionalEntityManager(ctx);
      if (!em) return null;
      return mapAppError(() => getDoc(em, appContext(ctx), input));
    }),

  create: permissionedProcedure({ resource: "docs", action: "create" })
    .input(CreateDocInputSchema)
    .output(DocOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const normalizedInput = {
        ...input,
        links: input.links?.map((link) => ({
          kind: link.targetKind,
          id: link.targetId,
          targetKind: link.targetKind,
          targetId: link.targetId,
          linkKind: link.linkKind,
        })),
      };
      return mapAppError(() => createDoc(requireEntityManager(ctx), appContext(ctx), normalizedInput));
    }),

  update: permissionedProcedure({ resource: "docs", action: "update" })
    .input(UpdateDocInputSchema)
    .output(DocOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => updateDoc(requireEntityManager(ctx), appContext(ctx), input));
    }),

  delete: permissionedProcedure({ resource: "docs", action: "delete" })
    .input(DeleteDocInputSchema)
    .output(z.union([DocOutputSchema, HardDeleteOutputSchema]).nullable())
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => deleteDoc(requireEntityManager(ctx), appContext(ctx), input.id, input.hard));
    }),

  comments: t.router({
    list: permissionedProcedure({ resource: "docs", action: "list" })
      .input(ListCommentsInputSchema)
      .output(z.array(CommentOutputSchema))
      .query(async ({ ctx, input }) => {
        const em = optionalEntityManager(ctx);
        if (!em) return [];
        return listDocComments(em, appContext(ctx), input.docId, input.resolved);
      }),

    create: permissionedProcedure({ resource: "docs", action: "create" })
      .input(CreateCommentInputSchema)
      .output(CommentOutputSchema)
      .mutation(async ({ ctx, input }) => {
        return createDocComment(requireEntityManager(ctx), appContext(ctx), input);
      }),

    update: permissionedProcedure({ resource: "docs", action: "update" })
      .input(UpdateCommentInputSchema)
      .output(CommentOutputSchema.nullable())
      .mutation(async ({ ctx, input }) => {
        return updateDocComment(requireEntityManager(ctx), appContext(ctx), input.id, input.bodyMd);
      }),

    delete: permissionedProcedure({ resource: "docs", action: "delete" })
      .input(DeleteCommentInputSchema)
      .output(DeleteCommentOutputSchema.nullable())
      .mutation(async ({ ctx, input }) => {
        return deleteDocComment(requireEntityManager(ctx), appContext(ctx), input.id);
      }),

    resolve: permissionedProcedure({ resource: "docs", action: "resolve" })
      .input(ResolveCommentInputSchema)
      .output(CommentOutputSchema.nullable())
      .mutation(async ({ ctx, input }) => {
        return resolveDocComment(requireEntityManager(ctx), appContext(ctx), input.id, input.resolved);
      }),
  }),

  versions: t.router({
    list: permissionedProcedure({ resource: "docs", action: "list" })
      .input(VersionDocInputSchema)
      .output(z.array(VersionListOutputSchema))
      .query(async ({ ctx, input }) => {
        return mapAppError(() => listDocVersions(requireEntityManager(ctx), appContext(ctx), input.docId));
      }),

    get: permissionedProcedure({ resource: "docs", action: "get" })
      .input(VersionGetInputSchema)
      .output(VersionOutputSchema.nullable())
      .query(async ({ ctx, input }) => {
        return mapAppError(() => getDocVersion(requireEntityManager(ctx), appContext(ctx), input.docId, input.versionNum));
      }),

    diff: permissionedProcedure({ resource: "docs", action: "diff" })
      .input(VersionDiffInputSchema)
      .output(VersionDiffOutputSchema)
      .query(async ({ ctx, input }) => {
        return mapAppError(() =>
          diffDocVersions(
            requireEntityManager(ctx),
            appContext(ctx),
            input.docId,
            input.fromVersionNum,
            input.toVersionNum,
          )
        );
      }),

    restore: permissionedProcedure({ resource: "docs", action: "restore" })
      .input(VersionGetInputSchema)
      .output(DocOutputSchema)
      .mutation(async ({ ctx, input }) => {
        return mapAppError(() => restoreDocVersion(requireEntityManager(ctx), appContext(ctx), input.docId, input.versionNum));
      }),
  }),

  templates: docTemplatesRouter,

  links: t.router({
    listBacklinks: permissionedProcedure({ resource: "docs", action: "listBacklinks" })
      .input(DocLinksInputSchema)
      .output(z.array(BacklinkOutputSchema))
      .query(async ({ ctx, input }) => {
        const em = optionalEntityManager(ctx);
        if (!em) return [];
        return listDocBacklinks(em, appContext(ctx), input.docId);
      }),

    listForwardLinks: permissionedProcedure({ resource: "docs", action: "listForwardLinks" })
      .input(DocLinksInputSchema)
      .output(z.array(ForwardLinkOutputSchema))
      .query(async ({ ctx, input }) => {
        const em = optionalEntityManager(ctx);
        if (!em) return [];
        return listDocForwardLinks(em, appContext(ctx), input.docId);
      }),
  }),
});

export type DocsRouter = typeof docsRouter;
