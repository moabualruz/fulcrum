import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import type { EntityManager } from "@mikro-orm/postgresql";
import { router, publicProcedure } from "../trpc.ts";
import { protectedProcedure } from "../middleware.ts";
import {
  cancelRun,
  createRun,
  getOrchestratorStatus,
  getRun,
  getSymphonyDriftReport,
  listRuns,
  listWorkflowDefs,
  renderPromptPreview as renderTemplatePromptPreview,
  retryRun,
  upsertWorkflowDef,
} from "../../product-kernel/symphony.ts";
import type { ProductDb } from "../../product-kernel/db/types.ts";
import {
  claimRun as claimSymphonyRun,
  ClaimConflictError,
} from "../../orchestration/symphony/orchestrator.ts";
import {
  fetchCandidateIssues,
  fetchIssuesByStates,
  fetchIssueStatesByIds,
} from "../../orchestration/symphony/tracker.ts";
import {
  AGENT_RUN_ORCHESTRATION_STATES,
  type AgentRunOrchestrationState,
} from "../../orchestration/states.ts";
import { getWorkspacePath } from "../../orchestration/symphony/workspace.ts";
import {
  parseWorkflowConfig,
  renderPrompt,
} from "../../orchestration/symphony/prompt.ts";

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

const AgentRunOrchestrationStateSchema = z.enum(AGENT_RUN_ORCHESTRATION_STATES);

function requireDb(ctx: { db?: ProductDb }): ProductDb {
  if (!ctx.db) {
    throw new Error("ProductDb is required for orchestration procedures.");
  }
  return ctx.db;
}

function requireEm(ctx: { em?: EntityManager | null }): EntityManager {
  if (!ctx.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager is required for Symphony orchestration procedures.",
    });
  }
  return ctx.em;
}

function requireOrgId(ctx: { orgId: string | null }): string {
  if (!ctx.orgId) {
    throw new Error("orgId is required for orchestration procedures.");
  }
  return ctx.orgId;
}

function inputOrgId(ctx: { orgId: string | null }, orgId?: string): string {
  return orgId ?? requireOrgId(ctx);
}

async function getAgentRunForApi(
  em: EntityManager,
  orgId: string,
  runId: string,
): Promise<{
  id: string;
  state: AgentRunOrchestrationState | null;
  orchestrationState: AgentRunOrchestrationState | null;
  workspacePath: string | null;
  renderedPrompt: null;
  attemptCount: number;
  nextRetryAt: Date | null;
  lastErrorKind: string | null;
} | null> {
  const { AgentRun } = await import("../../db/entities/orchestration/AgentRun.ts");
  const fork = em.fork();
  const run = await fork.findOne(AgentRun, {
    id: runId,
    org: orgId,
  } as never);
  if (!run) return null;

  const state = run.orchestrationState ?? null;
  return {
    id: run.id,
    state,
    orchestrationState: state,
    workspacePath: run.workspacePath ?? null,
    renderedPrompt: null,
    attemptCount: run.attemptCount,
    nextRetryAt: run.nextRetryAt ?? null,
    lastErrorKind: run.lastErrorKind ?? null,
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export const orchestrationRouter = router({
  list: protectedProcedure
    .input(z.void())
    .output(z.array(z.never()))
    .query(() => []),

  listRuns: publicProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .output(z.array(SymphonyRunSchema))
    .query(async ({ input, ctx }) => {
      return listRuns(requireDb(ctx), requireOrgId(ctx), {
        limit: input.limit,
        offset: input.offset,
      });
    }),

  getRun: publicProcedure
    .input(
      z.object({
        id: z.string().optional(),
        runId: z.string().optional(),
      }).refine((input) => Boolean(input.id ?? input.runId), {
        message: "id or runId is required",
      }),
    )
    .query(async ({ input, ctx }) => {
      if (input.runId) {
        return getAgentRunForApi(requireEm(ctx), requireOrgId(ctx), input.runId);
      }
      return getRun(requireDb(ctx), input.id as string);
    }),

  cancelRun: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(SymphonyRunSchema.nullable())
    .mutation(async ({ input, ctx }) => {
      return cancelRun(requireDb(ctx), input.id);
    }),

  retryRun: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(SymphonyRunSchema.nullable())
    .mutation(async ({ input, ctx }) => {
      return retryRun(requireDb(ctx), input.id);
    }),

  getOrchestratorStatus: publicProcedure
    .input(z.object({}))
    .output(OrchestratorStatusSchema)
    .query(async ({ ctx }) => {
      return getOrchestratorStatus(requireDb(ctx), requireOrgId(ctx));
    }),

  listWorkflowDefs: publicProcedure
    .input(z.object({}))
    .output(z.array(WorkflowDefSchema))
    .query(async ({ ctx }) => {
      return listWorkflowDefs(requireDb(ctx), requireOrgId(ctx));
    }),

  upsertWorkflowDef: protectedProcedure
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
      return upsertWorkflowDef(requireDb(ctx), {
        orgId: requireOrgId(ctx),
        ...input,
      });
    }),

  renderPromptPreview: publicProcedure
    .input(
      z.union([
        z.object({
          template: z.string(),
          variables: z.record(z.string(), z.string()),
        }),
        z.object({
          orgId: z.string(),
          promptMd: z.string(),
          configYaml: z.string(),
          issue: z.record(z.string(), z.unknown()),
          attempt: z.number().int().nullable(),
        }),
      ]),
    )
    .query(async ({ input }) => {
      if ("template" in input) {
        return {
          rendered: renderTemplatePromptPreview(input.template, input.variables),
        };
      }

      return {
        prompt: await renderPrompt(
          {
            id: "preview",
            promptMd: input.promptMd,
            configYaml: input.configYaml,
          },
          {
            issue: input.issue,
            attempt: input.attempt,
          },
        ),
        config: parseWorkflowConfig(input.configYaml),
      };
    }),

  fetchCandidateIssues: publicProcedure
    .input(
      z.object({
        orgId: z.string().optional(),
        limit: z.number().int().min(1).max(500).optional(),
      }).optional(),
    )
    .query(async ({ input, ctx }) => {
      return fetchCandidateIssues(
        requireEm(ctx),
        inputOrgId(ctx, input?.orgId),
        input?.limit,
      );
    }),

  fetchIssuesByStates: publicProcedure
    .input(
      z.object({
        orgId: z.string().optional(),
        states: z.array(AgentRunOrchestrationStateSchema),
        limit: z.number().int().min(1).max(500).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return fetchIssuesByStates(
        requireEm(ctx),
        inputOrgId(ctx, input.orgId),
        input.states,
        input.limit,
      );
    }),

  fetchIssueStatesByIds: publicProcedure
    .input(
      z.object({
        orgId: z.string().optional(),
        runIds: z.array(z.string()),
      }),
    )
    .query(async ({ input, ctx }) => {
      return fetchIssueStatesByIds(
        requireEm(ctx),
        inputOrgId(ctx, input.orgId),
        input.runIds,
      );
    }),

  getWorkspacePath: publicProcedure
    .input(
      z.object({
        orgId: z.string().optional(),
        runId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return getWorkspacePath(
        requireEm(ctx),
        inputOrgId(ctx, input.orgId),
        input.runId,
      );
    }),

  claimRun: protectedProcedure
    .input(
      z.object({
        orgId: z.string().optional(),
        taskId: z.string(),
        instanceId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await claimSymphonyRun(
          requireEm(ctx),
          inputOrgId(ctx, input.orgId),
          input.taskId,
          input.instanceId,
        );
      } catch (error) {
        if (error instanceof ClaimConflictError) {
          throw new TRPCError({
            code: "CONFLICT",
            message: error.message,
            cause: error,
          });
        }
        throw error;
      }
    }),

  getSymphonyDriftReport: publicProcedure
    .input(z.object({ staleMinutes: z.number().int().min(1).optional() }))
    .output(z.array(DriftEntrySchema))
    .query(async ({ input, ctx }) => {
      return getSymphonyDriftReport(requireDb(ctx), requireOrgId(ctx), input.staleMinutes);
    }),
});

export type OrchestrationRouter = typeof orchestrationRouter;
