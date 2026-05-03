import { TRPCError } from "@trpc/server";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";

import { Org } from "../../../db/entities/auth/Org.ts";
import { Document } from "../../../db/entities/docs/Document.ts";
import { DocVersion } from "../../../db/entities/docs/DocVersion.ts";
import { DocTypeEnum, ScopeEnum } from "../../../db/entities/docs/enums.ts";
import { SearchDocument } from "../../../db/entities/search/SearchDocument.ts";
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

type DocOutput = z.infer<typeof DocOutputSchema>;
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

async function writeVersion(
  em: import("@mikro-orm/postgresql").EntityManager,
  orgId: string,
  doc: Document,
): Promise<void> {
  const count = await em.count(DocVersion, { doc: doc.id } as never);
  em.persist(em.create(DocVersion, {
    id: randomUUID(),
    org: em.getReference(Org, orgId),
    doc,
    versionNum: count + 1,
    snapshot: doc.contentJson,
    bodyMdSnapshot: doc.bodyMd,
    author: null,
    createdAt: new Date(),
  } as never));
}

async function upsertSearchDocument(
  em: import("@mikro-orm/postgresql").EntityManager,
  orgId: string,
  docId: string,
): Promise<void> {
  const existing = await em.findOne(SearchDocument, {
    org: orgId,
    entityKind: "doc",
    entityId: docId,
  } as never);
  if (existing) return;

  em.persist(em.create(SearchDocument, {
    id: randomUUID(),
    org: em.getReference(Org, orgId),
    entityKind: "doc",
    entityId: docId,
  }));
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
      await writeVersion(em, ctx.orgId, doc);
      await upsertSearchDocument(em, ctx.orgId, doc.id);
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
      await writeVersion(em, ctx.orgId, doc);
      await upsertSearchDocument(em, ctx.orgId, doc.id);
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
        em.remove(doc);
        await em.flush();
        return { deleted: true };
      }

      doc.archived = true;
      doc.updatedAt = new Date();
      em.persist(doc);
      await em.flush();
      return serializeDoc(doc);
    }),

  templates: docTemplatesRouter,
});

export type DocsRouter = typeof docsRouter;
