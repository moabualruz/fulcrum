import { TRPCError } from "@trpc/server";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";

import { Org } from "../../../db/entities/auth/Org.ts";
import { User } from "../../../db/entities/auth/User.ts";
import { DocComment } from "../../../db/entities/docs/DocComment.ts";
import { DocLink } from "../../../db/entities/docs/DocLink.ts";
import { Document } from "../../../db/entities/docs/Document.ts";
import { DocVersion } from "../../../db/entities/docs/DocVersion.ts";
import { DocTypeEnum, ScopeEnum } from "../../../db/entities/docs/enums.ts";
import { archiveDocIndex, indexDoc, removeDocIndex } from "../../../docs/search-indexer.ts";
import { diffDocVersionsHtml, reconstructDocVersion } from "../../../docs/version-reconstructor.ts";
import { writeDocVersion } from "../../../docs/version-writer.ts";
import { syncDocWikilinks } from "../../../docs/wikilink-extractor.ts";
import { protectedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";
import { docTemplatesRouter } from "./doc-templates.ts";

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
const DocLinksInputSchema = z.object({
  docId: z.uuid(),
});
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

type DocOutput = z.infer<typeof DocOutputSchema>;
type CommentOutput = z.infer<typeof CommentOutputSchema>;
type AuthCtx = {
  orgId: string;
  userId: string;
  em: import("@mikro-orm/postgresql").EntityManager | null;
};

function serializeDoc(doc: Document): DocOutput {
  const frontmatter = doc.frontmatter ?? {};
  const title = typeof frontmatter.title === "string" ? frontmatter.title : doc.externalId ?? doc.id;

  return {
    id: doc.id,
    orgId: doc.org.id,
    title,
    slug: doc.externalId ?? doc.id,
    parentId: doc.parent?.id ?? null,
    projectId: doc.projectId,
    scope: doc.scope,
    docType: doc.docType,
    frontmatter,
    bodyMd: doc.bodyMd,
    contentJson: doc.contentJson,
    sortPosition: doc.sortPosition,
    archived: doc.archived,
    externalId: doc.externalId,
    updatedAt: doc.updatedAt,
  };
}

function requireEntityManager(ctx: AuthCtx): import("@mikro-orm/postgresql").EntityManager {
  if (!ctx.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager is not available.",
    });
  }
  return ctx.em;
}

function markdownToTipTap(markdown: string): Record<string, unknown> {
  const paragraphs = markdown.split(/\n{2,}/).map((text) => text.trim()).filter(Boolean);
  return {
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
}

function slugBase(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "doc";
}

function slugSuffix(): string {
  return randomBytes(4).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6).padEnd(6, "0");
}

async function uniqueSlug(em: import("@mikro-orm/postgresql").EntityManager, orgId: string, title: string): Promise<string> {
  const prefix = `${slugBase(title)}-${slugSuffix()}`;
  let slug = prefix;
  let counter = 2;

  while (await em.findOne(Document, { org: orgId, externalId: slug } as never)) {
    slug = `${prefix}-${counter}`;
    counter += 1;
  }
  return slug;
}

async function findDocByInput(
  em: import("@mikro-orm/postgresql").EntityManager,
  orgId: string,
  input: z.infer<typeof GetDocInputSchema> & { includeArchived?: boolean },
): Promise<Document | null> {
  const where = "id" in input && input.id
    ? { org: orgId, id: input.id }
    : { org: orgId, externalId: input.slug };
  return em.findOne(Document, {
    ...where,
    ...(input.includeArchived ? {} : { archived: false }),
  } as never);
}

async function upsertSearchDocument(
  em: import("@mikro-orm/postgresql").EntityManager,
  orgId: string,
  docId: string,
  authorId: string | null = null,
): Promise<void> {
  const doc = await em.findOne(Document, { org: orgId, id: docId } as never, { populate: ["org"] });
  if (!doc) return;
  await indexDoc(em, doc, authorId);
}

async function resolveParent(
  em: import("@mikro-orm/postgresql").EntityManager,
  orgId: string,
  parentId: string | null | undefined,
): Promise<Document | null> {
  if (parentId === undefined || parentId === null) return null;
  const parent = await em.findOne(Document, { org: orgId, id: parentId, archived: false } as never);
  if (!parent) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Parent document not found." });
  }
  return parent;
}

function anchorPosition(comment: DocComment): number {
  const from = comment.anchorRange?.from;
  return typeof from === "number" ? from : Number.MAX_SAFE_INTEGER;
}

function serializeComment(comment: DocComment, replies: CommentOutput["replies"] = []): CommentOutput {
  return {
    id: comment.id,
    orgId: comment.org.id,
    docId: comment.doc.id,
    anchorRange: comment.anchorRange,
    authorId: comment.author?.id ?? null,
    bodyMd: comment.bodyMd,
    parentCommentId: comment.parentComment?.id ?? null,
    resolved: comment.resolved,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    replies,
  };
}

function serializeVersion(version: DocVersion): z.infer<typeof VersionOutputSchema> {
  return {
    id: version.id,
    versionNum: version.versionNum,
    isSnapshot: version.snapshot !== null,
    authorId: version.author?.id ?? null,
    createdAt: version.createdAt,
    bodyMdSnapshot: version.bodyMdSnapshot,
    restoreOfId: version.restoreOf?.id ?? null,
  };
}

async function requireDoc(
  em: import("@mikro-orm/postgresql").EntityManager,
  orgId: string,
  docId: string,
): Promise<Document> {
  const doc = await em.findOne(Document, { org: orgId, id: docId, archived: false } as never);
  if (!doc) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
  }
  return doc;
}

async function findComment(
  em: import("@mikro-orm/postgresql").EntityManager,
  orgId: string,
  id: string,
): Promise<DocComment | null> {
  return em.findOne(DocComment, { org: orgId, id } as never, {
    populate: ["org", "doc", "author", "parentComment"],
  });
}

async function assertCommentDeleteAllowed(
  em: import("@mikro-orm/postgresql").EntityManager,
  ctx: AuthCtx,
  comment: DocComment,
): Promise<void> {
  if (comment.author?.id === ctx.userId) return;

  const user = await em.findOne(User, { orgId: ctx.orgId, id: ctx.userId });
  if (user?.role === "owner" || user?.role === "admin") return;

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Only the author or an org admin can delete this comment.",
  });
}

export const docsRouter = t.router({
  list: protectedProcedure
    .input(ListDocsInputSchema)
    .output(z.array(DocOutputSchema))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) return [];
      const em = requireEntityManager(ctx);
      const docs = await em.find(
        Document,
        {
          org: ctx.orgId,
          archived: input?.archived ?? false,
          ...(input?.scope ? { scope: input.scope } : {}),
          ...(input?.docType ? { docType: input.docType } : {}),
          ...(input && "parentId" in input ? { parent: input.parentId } : {}),
        } as never,
        {
          orderBy: { sortPosition: "ASC", updatedAt: "DESC", id: "ASC" },
          limit: input?.limit ?? 50,
          offset: input?.offset ?? 0,
        },
      );
      return docs.map(serializeDoc);
    }),

  get: protectedProcedure
    .input(GetDocInputSchema)
    .output(DocOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      if (!ctx.em) return null;
      const em = requireEntityManager(ctx);
      const doc = await findDocByInput(em, ctx.orgId, input);
      if (!doc) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
      }
      return serializeDoc(doc);
    }),

  create: protectedProcedure
    .input(CreateDocInputSchema)
    .output(DocOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const bodyMd = input.bodyMd ?? "";
      const parent = await resolveParent(em, ctx.orgId, input.parentId);
      const frontmatter = { ...(input.frontmatter ?? {}), title: input.title };
      const doc = em.create(Document, {
        id: randomUUID(),
        org: em.getReference(Org, ctx.orgId),
        parent,
        projectId: input.projectId ?? null,
        scope: input.scope ?? "project",
        docType: input.docType ?? "note",
        frontmatter,
        bodyMd,
        contentJson: input.contentJson ?? markdownToTipTap(bodyMd),
        sortPosition: input.sortPosition ?? 0,
        archived: false,
        externalId: await uniqueSlug(em, ctx.orgId, input.title),
        updatedAt: new Date(),
      });
      em.persist(doc);
      await writeDocVersion(em, { orgId: ctx.orgId, doc, authorId: ctx.userId });
      await upsertSearchDocument(em, ctx.orgId, doc.id, ctx.userId);
      await em.flush();
      return serializeDoc(doc);
    }),

  update: protectedProcedure
    .input(UpdateDocInputSchema)
    .output(DocOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const doc = await em.findOne(Document, { org: ctx.orgId, id: input.id, archived: false } as never);
      if (!doc) return null;

      if (input.parentId !== undefined) doc.parent = await resolveParent(em, ctx.orgId, input.parentId);
      if (input.projectId !== undefined) doc.projectId = input.projectId;
      if (input.scope !== undefined) doc.scope = input.scope;
      if (input.docType !== undefined) doc.docType = input.docType;
      if (input.frontmatter !== undefined) doc.frontmatter = input.frontmatter;
      if (input.title !== undefined) doc.frontmatter = { ...doc.frontmatter, title: input.title };
      if (input.bodyMd !== undefined) {
        doc.bodyMd = input.bodyMd;
        if (input.contentJson === undefined) doc.contentJson = markdownToTipTap(input.bodyMd);
      }
      if (input.contentJson !== undefined) doc.contentJson = input.contentJson;
      if (input.sortPosition !== undefined) doc.sortPosition = input.sortPosition;
      if (input.archived !== undefined) doc.archived = input.archived;
      doc.updatedAt = new Date();

      em.persist(doc);
      await syncDocWikilinks(em, ctx.orgId, doc, doc.contentJson);
      await writeDocVersion(em, { orgId: ctx.orgId, doc, authorId: ctx.userId });
      await upsertSearchDocument(em, ctx.orgId, doc.id, ctx.userId);
      await em.flush();
      return serializeDoc(doc);
    }),

  delete: protectedProcedure
    .input(DeleteDocInputSchema)
    .output(z.union([DocOutputSchema, HardDeleteOutputSchema]).nullable())
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const doc = await em.findOne(Document, { org: ctx.orgId, id: input.id } as never);
      if (!doc) return null;

      if (input.hard) {
        await removeDocIndex(em, ctx.orgId, doc.id);
        em.remove(doc);
        await em.flush();
        return { deleted: true };
      }

      doc.archived = true;
      doc.updatedAt = new Date();
      em.persist(doc);
      await archiveDocIndex(em, ctx.orgId, doc.id);
      await em.flush();
      return serializeDoc(doc);
    }),

  comments: t.router({
    list: protectedProcedure
      .input(ListCommentsInputSchema)
      .output(z.array(CommentOutputSchema))
      .query(async ({ ctx, input }) => {
        if (!ctx.em) return [];
        const em = requireEntityManager(ctx);
        const doc = await em.findOne(Document, { org: ctx.orgId, id: input.docId } as never);
        if (!doc) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
        }

        const comments = await em.find(DocComment, {
          org: ctx.orgId,
          doc: input.docId,
          resolved: input.resolved ?? false,
        } as never, {
          populate: ["org", "doc", "author", "parentComment"],
          orderBy: { createdAt: "ASC", id: "ASC" },
        });
        const roots = comments
          .filter((comment) => comment.parentComment === null)
          .sort((left, right) => anchorPosition(left) - anchorPosition(right));
        const repliesByParent = new Map<string, DocComment[]>();
        for (const comment of comments) {
          const parentId = comment.parentComment?.id;
          if (!parentId) continue;
          const replies = repliesByParent.get(parentId) ?? [];
          replies.push(comment);
          repliesByParent.set(parentId, replies);
        }

        return roots.map((comment) => serializeComment(
          comment,
          (repliesByParent.get(comment.id) ?? []).map((reply) => serializeComment(reply, []) as CommentOutput["replies"][number]),
        ));
      }),

    create: protectedProcedure
      .input(CreateCommentInputSchema)
      .output(CommentOutputSchema)
      .mutation(async ({ ctx, input }) => {
        const em = requireEntityManager(ctx);
        const doc = await em.findOne(Document, { org: ctx.orgId, id: input.docId, archived: false } as never);
        if (!doc) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Document not found." });
        }

        let parentComment: DocComment | null = null;
        if (input.parentCommentId) {
          parentComment = await em.findOne(DocComment, {
            org: ctx.orgId,
            doc: input.docId,
            id: input.parentCommentId,
          } as never);
          if (!parentComment) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Parent comment not found." });
          }
        }

        const author = await em.findOne(User, { orgId: ctx.orgId, id: ctx.userId });
        const comment = em.create(DocComment, {
          id: randomUUID(),
          org: em.getReference(Org, ctx.orgId),
          doc,
          anchorRange: input.anchorRange ?? null,
          author,
          bodyMd: input.bodyMd,
          parentComment,
          resolved: parentComment?.resolved ?? false,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never);
        em.persist(comment);
        await em.flush();
        return serializeComment(comment);
      }),

    update: protectedProcedure
      .input(UpdateCommentInputSchema)
      .output(CommentOutputSchema.nullable())
      .mutation(async ({ ctx, input }) => {
        const em = requireEntityManager(ctx);
        const comment = await findComment(em, ctx.orgId, input.id);
        if (!comment) return null;
        if (comment.author?.id !== ctx.userId) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the author can update this comment.",
          });
        }

        comment.bodyMd = input.bodyMd;
        comment.updatedAt = new Date();
        em.persist(comment);
        await em.flush();
        return serializeComment(comment);
      }),

    delete: protectedProcedure
      .input(DeleteCommentInputSchema)
      .output(DeleteCommentOutputSchema.nullable())
      .mutation(async ({ ctx, input }) => {
        const em = requireEntityManager(ctx);
        const comment = await findComment(em, ctx.orgId, input.id);
        if (!comment) return null;

        await assertCommentDeleteAllowed(em, ctx, comment);
        em.remove(comment);
        await em.flush();
        return { deleted: true };
      }),

    resolve: protectedProcedure
      .input(ResolveCommentInputSchema)
      .output(CommentOutputSchema.nullable())
      .mutation(async ({ ctx, input }) => {
        const em = requireEntityManager(ctx);
        const comment = await findComment(em, ctx.orgId, input.id);
        if (!comment) return null;
        if (comment.parentComment) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Only root comment threads can be resolved.",
          });
        }

        comment.resolved = input.resolved;
        comment.updatedAt = new Date();
        em.persist(comment);
        await em.flush();
        return serializeComment(comment);
      }),
  }),

  versions: t.router({
    list: protectedProcedure
      .input(VersionDocInputSchema)
      .output(z.array(VersionListOutputSchema))
      .query(async ({ ctx, input }) => {
        const em = requireEntityManager(ctx);
        await requireDoc(em, ctx.orgId, input.docId);
        const versions = await em.find(DocVersion, {
          org: ctx.orgId,
          doc: input.docId,
        } as never, {
          populate: ["author"],
          orderBy: { versionNum: "DESC" },
        });
        return versions.map((version) => ({
          id: version.id,
          versionNum: version.versionNum,
          isSnapshot: version.snapshot !== null,
          authorId: version.author?.id ?? null,
          createdAt: version.createdAt,
        }));
      }),

    get: protectedProcedure
      .input(VersionGetInputSchema)
      .output(VersionOutputSchema.nullable())
      .query(async ({ ctx, input }) => {
        const em = requireEntityManager(ctx);
        await requireDoc(em, ctx.orgId, input.docId);
        const version = await em.findOne(DocVersion, {
          org: ctx.orgId,
          doc: input.docId,
          versionNum: input.versionNum,
        } as never, {
          populate: ["author", "restoreOf"],
        });
        return version ? serializeVersion(version) : null;
      }),

    diff: protectedProcedure
      .input(VersionDiffInputSchema)
      .output(VersionDiffOutputSchema)
      .query(async ({ ctx, input }) => {
        const em = requireEntityManager(ctx);
        await requireDoc(em, ctx.orgId, input.docId);
        const from = await reconstructDocVersion(em, {
          orgId: ctx.orgId,
          docId: input.docId,
          versionNum: input.fromVersionNum,
        });
        const to = await reconstructDocVersion(em, {
          orgId: ctx.orgId,
          docId: input.docId,
          versionNum: input.toVersionNum,
        });
        return { html: diffDocVersionsHtml(from.contentJson, to.contentJson) };
      }),

    restore: protectedProcedure
      .input(VersionGetInputSchema)
      .output(DocOutputSchema)
      .mutation(async ({ ctx, input }) => {
        const em = requireEntityManager(ctx);
        const doc = await requireDoc(em, ctx.orgId, input.docId);
        const reconstructed = await reconstructDocVersion(em, {
          orgId: ctx.orgId,
          docId: input.docId,
          versionNum: input.versionNum,
        });

        doc.bodyMd = reconstructed.bodyMd;
        doc.contentJson = reconstructed.contentJson;
        doc.updatedAt = new Date();
        em.persist(doc);
        await syncDocWikilinks(em, ctx.orgId, doc, doc.contentJson);
        await writeDocVersion(em, {
          orgId: ctx.orgId,
          doc,
          authorId: ctx.userId,
          restoreOf: reconstructed.version,
        });
        await upsertSearchDocument(em, ctx.orgId, doc.id, ctx.userId);
        await em.flush();
        return serializeDoc(doc);
      }),
  }),

  templates: docTemplatesRouter,

  links: t.router({
    listBacklinks: protectedProcedure
      .input(DocLinksInputSchema)
      .output(z.array(BacklinkOutputSchema))
      .query(async ({ ctx, input }) => {
        if (!ctx.em) return [];
        const em = requireEntityManager(ctx);
        const links = await em.find(DocLink, {
          org: ctx.orgId,
          toDoc: input.docId,
          linkKind: "wikilink",
        } as never, {
          populate: ["fromDoc"],
          orderBy: { createdAt: "ASC", id: "ASC" },
        });

        return links.map((link) => {
          const from = link.fromDoc;
          const frontmatter = from.frontmatter ?? {};
          return {
            fromDocId: from.id,
            title: typeof frontmatter.title === "string" ? frontmatter.title : from.externalId ?? from.id,
            slug: from.externalId ?? from.id,
            linkKind: "wikilink" as const,
          };
        });
      }),

    listForwardLinks: protectedProcedure
      .input(DocLinksInputSchema)
      .output(z.array(ForwardLinkOutputSchema))
      .query(async ({ ctx, input }) => {
        if (!ctx.em) return [];
        const em = requireEntityManager(ctx);
        const links = await em.find(DocLink, {
          org: ctx.orgId,
          fromDoc: input.docId,
          linkKind: "wikilink",
        } as never, {
          populate: ["toDoc"],
          orderBy: { createdAt: "ASC", id: "ASC" },
        });

        return links.map((link) => ({
          toDocId: link.toDoc?.id ?? null,
          toSlug: link.toSlug,
          linkKind: "wikilink" as const,
        }));
      }),
  }),
});

export type DocsRouter = typeof docsRouter;
