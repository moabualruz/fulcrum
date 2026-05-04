import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { DocTypeEnum, ScopeEnum } from "../../../db/entities/docs/enums.ts";
import { protectedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";
import { DocService } from "../../../services/DocService.ts";
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

function requireService(ctx: { em: import("@mikro-orm/postgresql").EntityManager | null }): DocService {
  if (!ctx.em) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "EntityManager is not available." });
  }
  return new DocService(ctx.em);
}

// ── Router (thin delegation layer) ─────────────────────────────────

export const docsRouter = t.router({
  list: protectedProcedure
    .input(ListDocsInputSchema)
    .output(z.array(DocOutputSchema))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) return [];
      return requireService(ctx).list(ctx.orgId, input ?? undefined);
    }),

  get: protectedProcedure
    .input(GetDocInputSchema)
    .output(DocOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      if (!ctx.em) return null;
      return requireService(ctx).get(ctx.orgId, input);
    }),

  create: protectedProcedure
    .input(CreateDocInputSchema)
    .output(DocOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return requireService(ctx).create(ctx, input);
    }),

  update: protectedProcedure
    .input(UpdateDocInputSchema)
    .output(DocOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return requireService(ctx).update(ctx, input);
    }),

  delete: protectedProcedure
    .input(DeleteDocInputSchema)
    .output(z.union([DocOutputSchema, HardDeleteOutputSchema]).nullable())
    .mutation(async ({ ctx, input }) => {
      return requireService(ctx).delete(ctx, input.id, input.hard);
    }),

  comments: t.router({
    list: protectedProcedure
      .input(ListCommentsInputSchema)
      .output(z.array(CommentOutputSchema))
      .query(async ({ ctx, input }) => {
        if (!ctx.em) return [];
        return requireService(ctx).listComments(ctx, input.docId, input.resolved);
      }),

    create: protectedProcedure
      .input(CreateCommentInputSchema)
      .output(CommentOutputSchema)
      .mutation(async ({ ctx, input }) => {
        return requireService(ctx).createComment(ctx, input);
      }),

    update: protectedProcedure
      .input(UpdateCommentInputSchema)
      .output(CommentOutputSchema.nullable())
      .mutation(async ({ ctx, input }) => {
        return requireService(ctx).updateComment(ctx, input.id, input.bodyMd);
      }),

    delete: protectedProcedure
      .input(DeleteCommentInputSchema)
      .output(DeleteCommentOutputSchema.nullable())
      .mutation(async ({ ctx, input }) => {
        return requireService(ctx).deleteComment(ctx, input.id);
      }),

    resolve: protectedProcedure
      .input(ResolveCommentInputSchema)
      .output(CommentOutputSchema.nullable())
      .mutation(async ({ ctx, input }) => {
        return requireService(ctx).resolveComment(ctx, input.id, input.resolved);
      }),
  }),

  versions: t.router({
    list: protectedProcedure
      .input(VersionDocInputSchema)
      .output(z.array(VersionListOutputSchema))
      .query(async ({ ctx, input }) => {
        return requireService(ctx).listVersions(ctx, input.docId);
      }),

    get: protectedProcedure
      .input(VersionGetInputSchema)
      .output(VersionOutputSchema.nullable())
      .query(async ({ ctx, input }) => {
        return requireService(ctx).getVersion(ctx, input.docId, input.versionNum);
      }),

    diff: protectedProcedure
      .input(VersionDiffInputSchema)
      .output(VersionDiffOutputSchema)
      .query(async ({ ctx, input }) => {
        return requireService(ctx).diffVersions(ctx, input.docId, input.fromVersionNum, input.toVersionNum);
      }),

    restore: protectedProcedure
      .input(VersionGetInputSchema)
      .output(DocOutputSchema)
      .mutation(async ({ ctx, input }) => {
        return requireService(ctx).restoreVersion(ctx, input.docId, input.versionNum);
      }),
  }),

  templates: docTemplatesRouter,

  links: t.router({
    listBacklinks: protectedProcedure
      .input(DocLinksInputSchema)
      .output(z.array(BacklinkOutputSchema))
      .query(async ({ ctx, input }) => {
        if (!ctx.em) return [];
        return requireService(ctx).listBacklinks(ctx.orgId, input.docId);
      }),

    listForwardLinks: protectedProcedure
      .input(DocLinksInputSchema)
      .output(z.array(ForwardLinkOutputSchema))
      .query(async ({ ctx, input }) => {
        if (!ctx.em) return [];
        return requireService(ctx).listForwardLinks(ctx.orgId, input.docId);
      }),
  }),
});

export type DocsRouter = typeof docsRouter;
