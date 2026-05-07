/**
 * workflowsRouter — Phase 05 Plan 04.
 *
 * tRPC adapter for workflow transition validation, methodology,
 * enabled task types.
 *
 * Security: permissionedProcedure enforces session + org scope.
 * Transitions mutation gated to "workflows.update" (T-05-08).
 */

import { z } from "zod";

import {
  updateEnabledTaskTypes,
  updateMethodology,
  updateTransitions,
} from "../../../application/workflows/commands.ts";
import {
  getDefaultWorkflow,
  getEnabledTaskTypes,
  getMethodology,
  getTransitions,
  validateTransition,
  type Methodology,
  type WorkflowAppContext,
} from "../../../application/workflows/queries.ts";
import { appErrorToTrpcError } from "../../../application/error-mapping.ts";
import { AppError } from "../../../application/errors.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

// ── Schemas ────────────────────────────────────────────────────────────────────

const MethodologySchema = z.enum(["scrum", "kanban", "none"]);
const TaskTypeSchema = z.enum(["epic", "task", "subtask", "bug"]);
type EntityManager = import("@mikro-orm/postgresql").EntityManager;

function requireEntityManager(em: EntityManager | null): EntityManager {
  if (!em) throw new Error("No entity manager");
  return em;
}

function appContext(ctx: { orgId: string; userId: string }): WorkflowAppContext {
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

// ── Router ─────────────────────────────────────────────────────────────────────

export const workflowsRouter = t.router({
  getTransitions: permissionedProcedure({ resource: "workflows", action: "list" })
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return mapAppError(() => getTransitions(requireEntityManager(ctx["em"]), appContext(ctx), input));
    }),

  updateTransitions: permissionedProcedure({ resource: "workflows", action: "update" })
    .input(z.object({
      projectId: z.string().uuid(),
      transitions: z.record(z.string(), z.array(z.string())),
    }))
    .mutation(async ({ ctx, input }) => {
      await mapAppError(() => updateTransitions(requireEntityManager(ctx["em"]), appContext(ctx), input));
    }),

  validateTransition: permissionedProcedure({ resource: "workflows", action: "list" })
    .input(z.object({
      projectId: z.string().uuid(),
      fromStatus: z.string(),
      toStatus: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return mapAppError(() => validateTransition(requireEntityManager(ctx["em"]), appContext(ctx), input));
    }),

  getDefault: permissionedProcedure({ resource: "workflows", action: "list" })
    .input(z.object({
      methodology: MethodologySchema.optional().default("kanban"),
    }))
    .query(({ input }) => {
      return getDefaultWorkflow(input.methodology);
    }),

  getMethodology: permissionedProcedure({ resource: "workflows", action: "list" })
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return mapAppError(() => getMethodology(requireEntityManager(ctx["em"]), appContext(ctx), input));
    }),

  updateMethodology: permissionedProcedure({ resource: "workflows", action: "update" })
    .input(z.object({
      projectId: z.string().uuid(),
      methodology: MethodologySchema,
      resetWorkflow: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      await mapAppError(() => updateMethodology(requireEntityManager(ctx["em"]), appContext(ctx), {
        ...input,
        methodology: input.methodology as Methodology,
      }));
    }),

  getEnabledTaskTypes: permissionedProcedure({ resource: "workflows", action: "list" })
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return mapAppError(() => getEnabledTaskTypes(requireEntityManager(ctx["em"]), appContext(ctx), input));
    }),

  updateEnabledTaskTypes: permissionedProcedure({ resource: "workflows", action: "update" })
    .input(z.object({
      projectId: z.string().uuid(),
      types: z.array(TaskTypeSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      await mapAppError(() => updateEnabledTaskTypes(requireEntityManager(ctx["em"]), appContext(ctx), input));
    }),
});

export type WorkflowsRouter = typeof workflowsRouter;
