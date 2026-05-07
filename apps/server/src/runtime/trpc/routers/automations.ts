/**
 * automationsRouter — Phase 05 Plan 06
 *
 * tRPC adapter for automation CRUD + predefined templates.
 *
 * Security:
 *   T-05-15: Only project members can create/modify automations (permissionedProcedure).
 *   T-05-13: orgId sourced from ctx — actions cannot cross org boundaries.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createAutomation,
  deleteAutomation,
  updateAutomation,
  type AutomationCondition,
} from "@/application/automations/commands.ts";
import {
  getAutomationTemplates,
  listAutomations,
  type AutomationAppContext,
} from "@/application/automations/queries.ts";
import { appErrorToTrpcError } from "@/application/error-mapping.ts";
import { AppError } from "@/application/errors.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

type EntityManager = import("@mikro-orm/postgresql").EntityManager;

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

function requireEntityManager(em: EntityManager | null): EntityManager {
  if (!em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager could not be resolved.",
    });
  }
  return em;
}

function appContext(ctx: { orgId: string; userId: string }): AutomationAppContext {
  return { orgId: ctx.orgId, userId: ctx.userId };
}

async function mapAppError<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

// ── Router ─────────────────────────────────────────────────────────

export const automationsRouter = t.router({
  // List automations for a project
  list: permissionedProcedure({ resource: "automations", action: "list" })
    .input(z.object({ projectId: z.string().uuid() }))
    .query(({ ctx, input }) => {
      return mapAppError(() => listAutomations(requireEntityManager(ctx["em"]), appContext(ctx), input));
    }),

  // Create a new automation rule
  create: permissionedProcedure({ resource: "automations", action: "create" })
    .input(AutomationConfigSchema)
    .mutation(({ ctx, input }) => {
      return mapAppError(() => createAutomation(requireEntityManager(ctx["em"]), appContext(ctx), {
        projectId: input.projectId,
        name: input.name,
        triggerType: input.triggerType,
        triggerConfig: input.triggerConfig ?? null,
        condition: input.condition as AutomationCondition | null | undefined ?? null,
        actionType: input.actionType,
        actionConfig: input.actionConfig ?? null,
      }));
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
      return mapAppError(() => updateAutomation(requireEntityManager(ctx["em"]), appContext(ctx), {
        ...input,
        condition: input.condition as AutomationCondition | null | undefined,
      }));
    }),

  // Delete an automation rule
  delete: permissionedProcedure({ resource: "automations", action: "delete" })
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      return mapAppError(() => deleteAutomation(requireEntityManager(ctx["em"]), appContext(ctx), input));
    }),

  // Get predefined automation templates (D-92)
  templates: permissionedProcedure({ resource: "automations", action: "list" })
    .query(({ ctx }) => {
      return mapAppError(() => getAutomationTemplates(requireEntityManager(ctx["em"])));
    }),
});
