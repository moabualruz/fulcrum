/**
 * doc-templates tRPC sub-router — mounted at docs.templates.
 *
 * Procedures:
 *   docs.templates.list({ projectId? })   → DocTemplateRow[]
 *   docs.templates.resolve({ docType, projectId }) → DocTemplateRow | null
 *
 * Application layer owns service resolution and template persistence.
 */

import { z } from "zod";

import { DocTypeEnum } from "../../../application/docs/types.ts";
import { listDocTemplates, resolveDocTemplate } from "../../../application/templates/queries.ts";
import { t } from "../../../trpc/trpc.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";

// ─── Output schema ────────────────────────────────────────────────────────────

const DocTemplateRowSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  projectId: z.string().nullable(),
  docType: z.string(),
  name: z.string(),
  frontmatterTemplate: z.record(z.string(), z.unknown()),
  bodyTemplate: z.string(),
  isDefault: z.boolean(),
  createdAt: z.union([z.string(), z.date().transform((date) => date.toISOString())]),
});

type EntityManager = import("@mikro-orm/postgresql").EntityManager;
type Container = import("@needle-di/core").Container;

// ─── Router ───────────────────────────────────────────────────────────────────

export const docTemplatesRouter = t.router({
  /**
   * List all templates for the authenticated org.
   * If projectId is supplied, results are scoped to that project (project-specific + org-defaults).
   */
  list: permissionedProcedure({ resource: "docs.templates", action: "list" })
    .input(
      z.object({
        projectId: z.string().uuid().nullable().optional(),
      }),
    )
    .output(z.array(DocTemplateRowSchema))
    .query(async ({ ctx, input }) => {
      return listDocTemplates(
        (ctx as Record<string, unknown>)["em"] as EntityManager | null,
        (ctx as Record<string, unknown>)["container"] as Container | null,
        { orgId: ctx.orgId },
        input.projectId,
      );
    }),

  /**
   * Resolve the best template for a doc_type + optional project.
   * Project-specific template wins over org default.
   */
  resolve: permissionedProcedure({ resource: "docs.templates", action: "resolve" })
    .input(
      z.object({
        docType: DocTypeEnum,
        projectId: z.string().uuid().nullable(),
      }),
    )
    .output(DocTemplateRowSchema.nullable())
    .query(async ({ ctx, input }) => {
      return resolveDocTemplate(
        (ctx as Record<string, unknown>)["em"] as EntityManager | null,
        (ctx as Record<string, unknown>)["container"] as Container | null,
        { orgId: ctx.orgId },
        input.projectId,
        input.docType,
      );
    }),
});

export type DocTemplatesRouter = typeof docTemplatesRouter;
