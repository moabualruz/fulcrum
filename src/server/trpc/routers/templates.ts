/**
 * templatesRouter — Phase 05 Plan 04 (D-115).
 *
 * tRPC surface for TemplateService.
 */

import { z } from "zod";

import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";
import { TemplateService } from "../../../services/TemplateService.ts";

export const templatesRouter = t.router({
  list: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new TemplateService(ctx.em);
      return svc.list(ctx.orgId, input.projectId);
    }),

  create: permissionedProcedure({ resource: "tasks", action: "create" })
    .input(z.object({
      projectId: z.string().uuid().optional(),
      name: z.string().min(1),
      templateData: z.record(z.string(), z.unknown()),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new TemplateService(ctx.em);
      return svc.create(
        ctx.orgId,
        input.projectId ?? null,
        input.name,
        input.templateData,
        ctx.userId,
        input.description,
      );
    }),

  apply: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(z.object({
      templateId: z.string().uuid(),
      overrides: z.record(z.string(), z.unknown()).optional(),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new TemplateService(ctx.em);
      return svc.apply(ctx.orgId, input.templateId, input.overrides ?? {});
    }),

  delete: permissionedProcedure({ resource: "tasks", action: "delete" })
    .input(z.object({ templateId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new TemplateService(ctx.em);
      await svc.delete(ctx.orgId, input.templateId);
    }),

  setDefault: permissionedProcedure({ resource: "tasks", action: "update" })
    .input(z.object({
      projectId: z.string().uuid(),
      templateId: z.string().uuid(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new TemplateService(ctx.em);
      await svc.setDefault(ctx.orgId, input.projectId, input.templateId);
    }),
});

export type TemplatesRouter = typeof templatesRouter;
