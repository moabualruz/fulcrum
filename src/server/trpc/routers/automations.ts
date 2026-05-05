/**
 * automationsRouter — Phase 05 Plan 06
 *
 * tRPC surface for AutomationService: CRUD + predefined templates.
 *
 * Security:
 *   T-05-15: Only project members can create/modify automations (permissionedProcedure).
 *   T-05-13: orgId sourced from ctx — actions cannot cross org boundaries.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";
import { AutomationService } from "../../../services/AutomationService.ts";
import { getEventBus } from "../../../subscriptions/event-bus.ts";

// ── Schemas ────────────────────────────────────────────────────────

const ConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(["equals", "not_equals", "contains", "is_empty", "is_not_empty"]),
  value: z.unknown().optional(),
});

const AutomationConfigSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(255),
  triggerType: z.string().min(1),
  triggerConfig: z.record(z.string(), z.unknown()).nullable().optional(),
  condition: ConditionSchema.nullable().optional(),
  actionType: z.string().min(1),
  actionConfig: z.record(z.string(), z.unknown()).nullable().optional(),
});

// ── Helpers ────────────────────────────────────────────────────────

function resolveService(ctx: { em: import("@mikro-orm/postgresql").EntityManager | null }): AutomationService {
  if (!ctx.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "AutomationService could not be resolved: no EntityManager in context.",
    });
  }
  return new AutomationService(ctx.em, getEventBus());
}

// ── Router ─────────────────────────────────────────────────────────

export const automationsRouter = t.router({
  // List automations for a project
  list: permissionedProcedure({ resource: "automations", action: "list" })
    .input(z.object({ projectId: z.string().uuid() }))
    .query(({ ctx, input }) => {
      return resolveService(ctx).list(ctx.orgId, input.projectId);
    }),

  // Create a new automation rule
  create: permissionedProcedure({ resource: "automations", action: "create" })
    .input(AutomationConfigSchema)
    .mutation(({ ctx, input }) => {
      return resolveService(ctx).create(ctx.orgId, {
        projectId: input.projectId,
        name: input.name,
        triggerType: input.triggerType,
        triggerConfig: input.triggerConfig ?? null,
        condition: input.condition ?? null,
        actionType: input.actionType,
        actionConfig: input.actionConfig ?? null,
      });
    }),

  // Update an existing automation rule
  update: permissionedProcedure({ resource: "automations", action: "update" })
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        triggerType: z.string().min(1).optional(),
        triggerConfig: z.record(z.string(), z.unknown()).nullable().optional(),
        condition: ConditionSchema.nullable().optional(),
        actionType: z.string().min(1).optional(),
        actionConfig: z.record(z.string(), z.unknown()).nullable().optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      return resolveService(ctx).update(ctx.orgId, input);
    }),

  // Delete an automation rule
  delete: permissionedProcedure({ resource: "automations", action: "delete" })
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      return resolveService(ctx).delete(ctx.orgId, input.id);
    }),

  // Get predefined automation templates (D-92)
  templates: permissionedProcedure({ resource: "automations", action: "list" })
    .query(({ ctx }) => {
      return resolveService(ctx).getTemplates();
    }),
});
