/**
 * workflowsRouter — Phase 05 Plan 04.
 *
 * tRPC surface for WorkflowService: transition validation, methodology,
 * enabled task types.
 *
 * Security: permissionedProcedure enforces session + org scope.
 * Transitions mutation gated to "workflows.update" (T-05-08).
 */

import { z } from "zod";

import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";
import { WorkflowService } from "../../../services/WorkflowService.ts";

// ── Schemas ────────────────────────────────────────────────────────────────────

const MethodologySchema = z.enum(["scrum", "kanban", "none"]);
const TaskTypeSchema = z.enum(["epic", "task", "subtask", "bug"]);

// ── Router ─────────────────────────────────────────────────────────────────────

export const workflowsRouter = t.router({
  getTransitions: permissionedProcedure({ resource: "workflows", action: "list" })
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new WorkflowService(ctx.em);
      return svc.getTransitionGraph(ctx.orgId, input.projectId);
    }),

  updateTransitions: permissionedProcedure({ resource: "workflows", action: "update" })
    .input(z.object({
      projectId: z.string().uuid(),
      transitions: z.record(z.array(z.string())),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new WorkflowService(ctx.em);
      await svc.updateTransitions(ctx.orgId, input.projectId, input.transitions);
    }),

  validateTransition: permissionedProcedure({ resource: "workflows", action: "list" })
    .input(z.object({
      projectId: z.string().uuid(),
      fromStatus: z.string(),
      toStatus: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new WorkflowService(ctx.em);
      return svc.validateTransition(ctx.orgId, input.projectId, input.fromStatus, input.toStatus);
    }),

  getDefault: permissionedProcedure({ resource: "workflows", action: "list" })
    .input(z.object({
      methodology: MethodologySchema.optional().default("kanban"),
    }))
    .query(({ input }) => {
      // getDefaultWorkflow is pure — no DB needed
      const svc = new WorkflowService(null as never);
      return svc.getDefaultWorkflow(input.methodology);
    }),

  getMethodology: permissionedProcedure({ resource: "workflows", action: "list" })
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new WorkflowService(ctx.em);
      return svc.getMethodology(ctx.orgId, input.projectId);
    }),

  updateMethodology: permissionedProcedure({ resource: "workflows", action: "update" })
    .input(z.object({
      projectId: z.string().uuid(),
      methodology: MethodologySchema,
      resetWorkflow: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new WorkflowService(ctx.em);
      await svc.updateMethodology(ctx.orgId, input.projectId, input.methodology, input.resetWorkflow);
    }),

  getEnabledTaskTypes: permissionedProcedure({ resource: "workflows", action: "list" })
    .input(z.object({ projectId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new WorkflowService(ctx.em);
      return svc.getEnabledTaskTypes(ctx.orgId, input.projectId);
    }),

  updateEnabledTaskTypes: permissionedProcedure({ resource: "workflows", action: "update" })
    .input(z.object({
      projectId: z.string().uuid(),
      types: z.array(TaskTypeSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.em) throw new Error("No entity manager");
      const svc = new WorkflowService(ctx.em);
      await svc.updateEnabledTaskTypes(ctx.orgId, input.projectId, input.types);
    }),
});

export type WorkflowsRouter = typeof workflowsRouter;
