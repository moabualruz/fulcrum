/**
 * Documents tRPC router — Pillar 7 (docs + wiki).
 *
 * Real CRUD backed by DocumentRepository (MikroORM EntityRepository<Document>).
 * All procedures scoped to ctx.orgId via permissionedProcedure.
 *
 * Threat mitigations:
 *   T-06-11: list/get scoped to orgId from auth context — no cross-tenant data.
 *   T-06-10: contentJson is ProseMirror JSON (structured), not raw HTML — XSS not
 *            applicable at storage layer; read-only renderer handles HTML output (T-06-13).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";
import type { TRPCContext } from "../context.ts";
import { ContextSummaryExtractor } from "../../docs/context-summary-extractor.ts";
import { syncDocWikilinks } from "../../docs/wikilink-extractor.ts";
import type { Document } from "../../db/entities/docs/Document.ts";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const DocTypeSchema = z.enum([
  "spec", "adr", "wiki", "runbook", "meeting", "postmortem", "rfc", "note", "scratch",
]);

const ContentJsonSchema = z.record(z.unknown());

const FrontmatterSchema = z.record(z.unknown()).optional();

// ---------------------------------------------------------------------------
// Dependency helpers
// ---------------------------------------------------------------------------

type DocumentsCtx = TRPCContext & {
  docs?: {
    repository?: {
      findAll?: (opts: Record<string, unknown>) => Promise<Document[]>;
      findOne?: (where: Record<string, unknown>, opts?: Record<string, unknown>) => Promise<Document | null>;
      create?: (data: Record<string, unknown>) => Document;
    };
  };
};

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

async function resolveDoc(ctx: TRPCContext, id: string): Promise<Document> {
  const em = getEm(ctx);
  const orgId = requireOrg(ctx);
  const doc = await em.findOne("Document" as never, { id, org: orgId } as never) as Document | null;
  if (!doc) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
  }
  return doc;
}

// Simple ProseMirror JSON → plain text walker for contextSummary extraction.
// Avoids requiring @tiptap/core on the server (no DOM).
function jsonToText(node: Record<string, unknown>): string {
  if (typeof node.text === "string") return node.text;
  const content = node.content as Record<string, unknown>[] | undefined;
  if (!content) return "";
  return content.map((child) => jsonToText(child)).join(" ");
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const documentsRouter = t.router({
  /** List docs by projectId, optionally scoped to docType. Returns flat list with parent info for tree building. */
  list: permissionedProcedure({ resource: "documents", action: "list" })
    .input(
      z.object({
        projectId: z.string().uuid().optional(),
        docType: DocTypeSchema.optional(),
        archived: z.boolean().optional().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const em = getEm(ctx);
      const orgId = requireOrg(ctx);

      const where: Record<string, unknown> = { org: orgId, archived: input.archived };
      if (input.projectId) where["projectId"] = input.projectId;
      if (input.docType) where["docType"] = input.docType;

      return em.find("Document" as never, where as never, {
        orderBy: { sortPosition: "ASC", updatedAt: "DESC" } as never,
        populate: ["parent"] as never,
      }) as Promise<Document[]>;
    }),

  /** Get a single document by id, including contentJson. */
  get: permissionedProcedure({ resource: "documents", action: "read" })
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return resolveDoc(ctx, input.id);
    }),

  /** Create a document. */
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
      const em = getEm(ctx);
      const orgId = requireOrg(ctx);

      const doc = em.create("Document" as never, {
        org: orgId,
        title: input.title,
        docType: input.docType,
        projectId: input.projectId ?? null,
        parent: input.parentId ?? null,
        sortPosition: input.sortPosition,
        contentJson: input.contentJson,
        frontmatter: input.frontmatter ?? {},
        bodyMd: "",
      } as never) as Document;

      await em.persistAndFlush(doc as never);
      return doc;
    }),

  /** Update document content + metadata. Triggers ContextSummaryExtractor and wikilink sync. */
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
      const em = getEm(ctx);
      const doc = await resolveDoc(ctx, input.id);

      if (input.title !== undefined) (doc as Record<string, unknown>)["title"] = input.title;
      if (input.frontmatter !== undefined) (doc as Record<string, unknown>)["frontmatter"] = input.frontmatter;

      if (input.contentJson !== undefined) {
        (doc as Record<string, unknown>)["contentJson"] = input.contentJson;

        // Extract plain text from ProseMirror JSON → run ContextSummaryExtractor
        const bodyMd = jsonToText(input.contentJson);
        (doc as Record<string, unknown>)["bodyMd"] = bodyMd;

        const extractor = new ContextSummaryExtractor();
        (doc as Record<string, unknown>)["contextSummary"] = extractor.extractSummary(bodyMd);

        // Sync wikilinks → doc_links table (T-06-10: structured JSON, not raw HTML)
        await syncDocWikilinks(em, requireOrg(ctx), doc, input.contentJson);
      }

      await em.flush();
      return doc;
    }),

  /** Update sort position + parent (drag-drop reorder per D-09). */
  updatePosition: permissionedProcedure({ resource: "documents", action: "write" })
    .input(
      z.object({
        id: z.string().uuid(),
        parentId: z.string().uuid().nullable().optional(),
        sortPosition: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const em = getEm(ctx);
      const doc = await resolveDoc(ctx, input.id);

      if (input.parentId !== undefined) {
        (doc as Record<string, unknown>)["parent"] = input.parentId;
      }
      (doc as Record<string, unknown>)["sortPosition"] = input.sortPosition;

      await em.flush();
      return doc;
    }),

  /** Soft-delete a document. */
  delete: permissionedProcedure({ resource: "documents", action: "write" })
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const em = getEm(ctx);
      const doc = await resolveDoc(ctx, input.id);

      (doc as Record<string, unknown>)["archived"] = true;
      await em.flush();
      return { id: input.id, archived: true };
    }),
});

export type DocumentsRouter = typeof documentsRouter;
