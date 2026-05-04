/**
 * doc-templates tRPC sub-router — mounted at docs.templates.
 *
 * Procedures:
 *   docs.templates.list({ projectId? })   → DocTemplateRow[]
 *   docs.templates.resolve({ docType, projectId }) → DocTemplateRow | null
 *
 * Service resolution order:
 *   1. DOC_TEMPLATE_SERVICE_TOKEN bound in ctx.container (tests inject mock)
 *   2. EntityManagerDocTemplateService built from ctx.em (production)
 *
 * C6: No raw SQL.
 * C7: MikroORM EntityManager via EntityManagerDocTemplateService fallback.
 * C8: needle-di token for DI.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { t } from "../../../trpc/trpc.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import {
  DOC_TEMPLATE_SERVICE_TOKEN,
  type DocTemplateService,
} from "../../../docs/doc-template-service.ts";
import { DocTypeEnum } from "../../../db/entities/docs/enums.ts";

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

// ─── Service resolver ─────────────────────────────────────────────────────────

async function resolveService(
  ctx: {
    container: import("@needle-di/core").Container | null;
    em: import("@mikro-orm/postgresql").EntityManager | null;
  },
): Promise<DocTemplateService> {
  if (ctx.container) {
    try {
      return ctx.container.get(DOC_TEMPLATE_SERVICE_TOKEN);
    } catch {
      // not bound — fall through to em-based impl
    }
  }

  if (ctx.em) {
    const { EntityManagerDocTemplateService } = await import(
      "../../../docs/em-doc-template-service.ts"
    );
    return new EntityManagerDocTemplateService(ctx.em);
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "DocTemplateService is not available (no container token or EntityManager).",
  });
}

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
      const svc = await resolveService(ctx);
      return svc.list(ctx.orgId!, input.projectId);
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
      const svc = await resolveService(ctx);
      return svc.resolve(ctx.orgId!, input.projectId, input.docType);
    }),
});

export type DocTemplatesRouter = typeof docTemplatesRouter;
