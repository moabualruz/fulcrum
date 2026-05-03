import { z } from "zod/v4";
import { router, publicProcedure } from "../trpc.ts";
import {
  cancelRun,
  createRun,
  getOrchestratorStatus,
  getRun,
  getSymphonyDriftReport,
  listRuns,
  listWorkflowDefs,
  renderPromptPreview,
  retryRun,
  upsertWorkflowDef,
} from "../../product-kernel/symphony.ts";

// ---------------------------------------------------------------------------
// Helpers — PGlite returns Date objects for timestamptz; coerce to ISO string
// ---------------------------------------------------------------------------
const dateToString = z.union([z.string(), z.date().transform((d) => d.toISOString())]);
const nullableDateToString = z.union([
  z.string(),
  z.date().transform((d) => d.toISOString()),
  z.null(),
]);

// ---------------------------------------------------------------------------
// Zod schemas — shared with REST layer and clients
// ---------------------------------------------------------------------------
const SymphonyStateSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "retry_queued",
]);

export const SymphonyRunSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  project_id: z.string().nullable(),
  workflow_def_id: z.string().nullable(),
  identifier: z.string(),
  symphony_state: SymphonyStateSchema,
  payload: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()).nullable(),
  next_retry_at: nullableDateToString,
  attempts: z.number(),
  max_attempts: z.number(),
  last_error: z.string().nullable(),
  created_at: dateToString,
  updated_at: dateToString,
});

export const WorkflowDefSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  project_id: z.string().nullable(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  prompt_template: z.string().nullable(),
  hooks: z.record(z.string(), z.unknown()),
  config: z.record(z.string(), z.unknown()),
  created_at: dateToString,
  updated_at: dateToString,
});

export const OrchestratorStatusSchema = z.object({
  pending: z.number(),
  running: z.number(),
  retry_queued: z.number(),
  succeeded: z.number(),
  failed: z.number(),
  cancelled: z.number(),
});

export const DriftEntrySchema = z.object({
  id: z.string(),
  identifier: z.string(),
  symphony_state: SymphonyStateSchema,
  updated_at: dateToString,
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export const orchestrationRouter = router({
  listRuns: publicProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .output(z.array(SymphonyRunSchema))
    .query(async ({ input, ctx }) => {
      return listRuns(ctx.db, ctx.orgId, {
        limit: input.limit,
        offset: input.offset,
      });
    }),

  getRun: publicProcedure
    .input(z.object({ id: z.string() }))
    .output(SymphonyRunSchema.nullable())
    .query(async ({ input, ctx }) => {
      return getRun(ctx.db, input.id);
    }),

  cancelRun: publicProcedure
    .input(z.object({ id: z.string() }))
    .output(SymphonyRunSchema.nullable())
    .mutation(async ({ input, ctx }) => {
      return cancelRun(ctx.db, input.id);
    }),

  retryRun: publicProcedure
    .input(z.object({ id: z.string() }))
    .output(SymphonyRunSchema.nullable())
    .mutation(async ({ input, ctx }) => {
      return retryRun(ctx.db, input.id);
    }),

  getOrchestratorStatus: publicProcedure
    .input(z.object({}))
    .output(OrchestratorStatusSchema)
    .query(async ({ ctx }) => {
      return getOrchestratorStatus(ctx.db, ctx.orgId);
    }),

  listWorkflowDefs: publicProcedure
    .input(z.object({}))
    .output(z.array(WorkflowDefSchema))
    .query(async ({ ctx }) => {
      return listWorkflowDefs(ctx.db, ctx.orgId);
    }),

  upsertWorkflowDef: publicProcedure
    .input(
      z.object({
        projectId: z.string().nullable().optional(),
        slug: z.string(),
        name: z.string(),
        description: z.string().nullable().optional(),
        promptTemplate: z.string().nullable().optional(),
        hooks: z.record(z.string(), z.unknown()).optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .output(WorkflowDefSchema)
    .mutation(async ({ input, ctx }) => {
      return upsertWorkflowDef(ctx.db, {
        orgId: ctx.orgId,
        ...input,
      });
    }),

  renderPromptPreview: publicProcedure
    .input(
      z.object({
        template: z.string(),
        variables: z.record(z.string(), z.string()),
      }),
    )
    .output(z.object({ rendered: z.string() }))
    .query(({ input }) => {
      return { rendered: renderPromptPreview(input.template, input.variables) };
    }),

  getSymphonyDriftReport: publicProcedure
    .input(z.object({ staleMinutes: z.number().int().min(1).optional() }))
    .output(z.array(DriftEntrySchema))
    .query(async ({ input, ctx }) => {
      return getSymphonyDriftReport(ctx.db, ctx.orgId, input.staleMinutes);
    }),
});

export type OrchestrationRouter = typeof orchestrationRouter;
