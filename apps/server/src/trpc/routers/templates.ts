/**
 * templatesRouter — task workflow (D-115).
 *
 * tRPC surface for WorkItemTemplateService.
 */

import { z } from "zod";

import {
  applyTemplate,
  createTemplate,
  deleteTemplate,
  listTemplates,
  setDefaultTemplate,
} from "@work-management/application/templates/queries.ts";
import type { AppContext } from "@work-management/application/templates/types.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

type EntityManager = import("typeorm").EntityManager;

function requireEntityManager(ctx: Record<string, unknown>): EntityManager {
  const em = ctx["em"] as EntityManager | null | undefined;
  if (!em) throw new Error("No entity manager");
  return em;
}

function appContext(ctx: { orgId: string; userId: string }): AppContext {
  return { orgId: ctx.orgId, userId: ctx.userId };
}

export const templatesRouter = t.router({
  list: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return listTemplates(requireEntityManager(ctx), appContext(ctx), input.projectId);
    }),

  create: permissionedProcedure({ resource: "tasks", action: "create" })
    .input(z.object({
      projectId: z.string().uuid().optional(),
      name: z.string().min(1),
      templateData: z.record(z.string(), z.unknown()),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return createTemplate(requireEntityManager(ctx), appContext(ctx), input);
    }),

  applyTemplate: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(z.object({
      templateId: z.string().uuid(),
      overrides: z.record(z.string(), z.unknown()).optional(),
    }))
    .query(async ({ ctx, input }) => {
      return applyTemplate(requireEntityManager(ctx), appContext(ctx), input.templateId, input.overrides ?? {});
    }),

  delete: permissionedProcedure({ resource: "tasks", action: "delete" })
    .input(z.object({ templateId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await deleteTemplate(requireEntityManager(ctx), appContext(ctx), input.templateId);
    }),

  setDefault: permissionedProcedure({ resource: "tasks", action: "update" })
    .input(z.object({
      projectId: z.string().uuid(),
      templateId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      await setDefaultTemplate(requireEntityManager(ctx), appContext(ctx), input.projectId, input.templateId);
    }),
});

export type TemplatesRouter = typeof templatesRouter;
