/**
 * Doc-versions tRPC router — version history, restore, and diff for documents.
 *
 * Threat mitigations:
 *   T-06-17 (Repudiation): restore creates a new version entry (audit trail preserved);
 *           original versions are never deleted.
 *   T-06-18 (Tampering): diff operates on server-side stored version snapshots;
 *           no client-supplied content is used for comparison.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";
import type { TRPCContext } from "../context.ts";
import { reconstructDocVersion, diffDocVersionsHtml } from "../../docs/version-reconstructor.ts";
import type { DocVersion } from "../../db/entities/docs/DocVersion.ts";

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

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const docVersionsRouter = t.router({
  /**
   * List all versions for a document, ordered newest-first.
   * Returns: id, versionNum, createdAt, authorId, authorName.
   */
  list: permissionedProcedure({ resource: "doc_versions", action: "list" })
    .input(z.object({ documentId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const em = getEm(ctx);
      const orgId = requireOrg(ctx);

      const versions = await em.find("DocVersion" as never, {
        org: orgId,
        doc: input.documentId,
      } as never, {
        orderBy: { versionNum: "DESC" } as never,
        populate: ["author"] as never,
      }) as DocVersion[];

      return versions.map((v) => ({
        id: v.id,
        versionNum: v.versionNum,
        createdAt: v.createdAt,
        authorId: (v.author as null | { id: string })?.id ?? null,
        authorName: (v.author as null | { name?: string; email?: string })?.name
          ?? (v.author as null | { name?: string; email?: string })?.email
          ?? null,
        isRestoreOf: (v.restoreOf as null | { id: string })?.id ?? null,
      }));
    }),

  /** Get one document version by ID. */
  get: permissionedProcedure({ resource: "doc_versions", action: "list" })
    .input(z.object({
      documentId: z.string().uuid(),
      versionId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      const em = getEm(ctx);
      const orgId = requireOrg(ctx);

      const version = await em.findOne("DocVersion" as never, {
        id: input.versionId,
        org: orgId,
        doc: input.documentId,
      } as never, {
        populate: ["author", "restoreOf"] as never,
      }) as DocVersion | null;

      if (!version) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }

      return {
        id: version.id,
        versionNum: version.versionNum,
        createdAt: version.createdAt,
        authorId: (version.author as null | { id: string })?.id ?? null,
        authorName: (version.author as null | { name?: string; email?: string })?.name
          ?? (version.author as null | { name?: string; email?: string })?.email
          ?? null,
        isRestoreOf: (version.restoreOf as null | { id: string })?.id ?? null,
      };
    }),

  /**
   * Restore document to the content of a previous version.
   * T-06-17: Creates a new version entry linking restoreOf → source version (audit trail).
   * Original versions are never deleted.
   */
  restore: permissionedProcedure({ resource: "doc_versions", action: "write" })
    .input(z.object({
      documentId: z.string().uuid(),
      versionId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      const em = getEm(ctx);
      const orgId = requireOrg(ctx);

      // Resolve the target version to get its versionNum
      const targetVersion = await em.findOne("DocVersion" as never, {
        id: input.versionId,
        org: orgId,
        doc: input.documentId,
      } as never) as DocVersion | null;

      if (!targetVersion) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }

      // Reconstruct document content at that version (server-side; T-06-18)
      const reconstructed = await reconstructDocVersion(em, {
        orgId,
        docId: input.documentId,
        versionNum: targetVersion.versionNum,
      });

      // Find current max version number
      const latestVersion = await em.findOne("DocVersion" as never, {
        org: orgId,
        doc: input.documentId,
      } as never, {
        orderBy: { versionNum: "DESC" } as never,
      }) as DocVersion | null;

      const nextVersionNum = (latestVersion?.versionNum ?? 0) + 1;

      // T-06-17: Create new version (audit trail — originals are never deleted)
      const newVersion = em.create("DocVersion" as never, {
        org: orgId,
        doc: input.documentId,
        versionNum: nextVersionNum,
        snapshot: reconstructed.contentJson,
        bodyMdSnapshot: reconstructed.bodyMd,
        author: ctx.userId ?? null,
        restoreOf: input.versionId,
      } as never) as DocVersion;

      em.persist(newVersion as never);
      await em.flush();

      return {
        id: newVersion.id,
        versionNum: nextVersionNum,
        restoredFromVersionId: input.versionId,
      };
    }),

  /**
   * Return HTML diff between a version and its predecessor.
   * T-06-18: Uses server-side stored snapshots; no client content used.
   */
  diff: permissionedProcedure({ resource: "doc_versions", action: "list" })
    .input(z.object({
      documentId: z.string().uuid(),
      versionId: z.string().uuid(),
    }))
    .query(async ({ ctx, input }) => {
      const em = getEm(ctx);
      const orgId = requireOrg(ctx);

      const version = await em.findOne("DocVersion" as never, {
        id: input.versionId,
        org: orgId,
        doc: input.documentId,
      } as never) as DocVersion | null;

      if (!version) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
      }

      if (version.versionNum <= 1) {
        // First version — no predecessor; return empty diff
        return { html: "", hasDiff: false };
      }

      const [current, previous] = await Promise.all([
        reconstructDocVersion(em, { orgId, docId: input.documentId, versionNum: version.versionNum }),
        reconstructDocVersion(em, { orgId, docId: input.documentId, versionNum: version.versionNum - 1 }),
      ]);

      const html = diffDocVersionsHtml(previous.contentJson, current.contentJson);
      return { html, hasDiff: true };
    }),
});

export type DocVersionsRouter = typeof docVersionsRouter;
