import { z } from "zod/v4";
import { TRPCError } from "@trpc/server";
import type { EntityManager } from "@mikro-orm/postgresql";
import { router, publicProcedure } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";
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
  type LegacySymphonyStore,
} from "@/application/legacy/symphony.ts";
import {
  dispatchTaskRun,
} from "@/application/runs/commands.ts";
import { buildDispatchTrace } from "@/application/orchestration/dispatch-trace.ts";
import { appErrorToTrpcError } from "@/application/error-mapping.ts";
import { AppError } from "@/application/errors.ts";
import {
  getRunDetail,
} from "@/application/runs/queries.ts";
import type { AppContext as RunsAppContext } from "@/application/runs/types.ts";
import {
  claimRun as claimSymphonyRun,
  ClaimConflictError,
} from "@/orchestration/symphony/orchestrator.ts";
import {
  fetchCandidateIssues,
  fetchIssuesByStates,
  fetchIssueStatesByIds,
} from "@/orchestration/symphony/tracker.ts";
import {
  AGENT_RUN_ORCHESTRATION_STATES,
  type AgentRunOrchestrationState,
} from "@/orchestration/states.ts";
import { getWorkspacePath } from "@/orchestration/symphony/workspace.ts";
import {
  parseWorkflowConfig,
  renderPrompt,
} from "@/orchestration/symphony/prompt.ts";

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

function requireLegacyStore(ctx: { legacyStore?: LegacySymphonyStore }): LegacySymphonyStore {
  if (!ctx.legacyStore) {
    throw new Error("Symphony legacy store is required for orchestration procedures.");
  }
  return ctx.legacyStore;
}

function requireEm(ctx: Record<string, unknown>): EntityManager {
  const manager = ctx["em"] as EntityManager | null | undefined;
  if (!manager) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager is required for Symphony orchestration procedures.",
    });
  }
  return manager;
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

function runsAppContext(ctx: { orgId: string | null; userId: string | null; projectId?: string | null }): RunsAppContext {
  return { orgId: requireOrgId(ctx), userId: ctx.userId, projectId: ctx.projectId ?? null };
}

async function getAgentRunForApi(
  manager: EntityManager,
  appCtx: RunsAppContext,
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
  observability: Awaited<ReturnType<typeof getRunDetail>>["observability"];
} | null> {
  const run = await getRunDetail(manager, appCtx, runId);
  const state = run.orchestrationState;
  return {
    id: run.id,
    state,
    orchestrationState: state,
    workspacePath: run.workspacePath,
    renderedPrompt: null,
    attemptCount: run.attemptCount,
    nextRetryAt: run.nextRetryAt,
    lastErrorKind: run.lastErrorKind,
    observability: run.observability,
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export const orchestrationRouter = router({
  list: permissionedProcedure({ resource: "orchestration", action: "list" })
    .input(z.void())
    .output(z.array(SymphonyRunSchema))
    .query(async ({ ctx }) => {
      if (!ctx.legacyStore) return [];
      return listRuns(requireLegacyStore(ctx), requireOrgId(ctx));
    }),

  listRuns: publicProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .output(z.array(SymphonyRunSchema))
    .query(async ({ input, ctx }) => {
      return listRuns(requireLegacyStore(ctx), requireOrgId(ctx), {
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
        return getAgentRunForApi(requireEm(ctx), runsAppContext(ctx), input.runId);
      }
      return getRun(requireLegacyStore(ctx), input.id as string);
    }),

  cancelRun: permissionedProcedure({ resource: "orchestration", action: "cancelRun" })
    .input(z.object({ id: z.string() }))
    .output(SymphonyRunSchema.nullable())
    .mutation(async ({ input, ctx }) => {
      return cancelRun(requireLegacyStore(ctx), input.id);
    }),

  retryRun: permissionedProcedure({ resource: "orchestration", action: "retryRun" })
    .input(z.object({ id: z.string() }))
    .output(SymphonyRunSchema.nullable())
    .mutation(async ({ input, ctx }) => {
      return retryRun(requireLegacyStore(ctx), input.id);
    }),

  getOrchestratorStatus: publicProcedure
    .input(z.object({}))
    .output(OrchestratorStatusSchema)
    .query(async ({ ctx }) => {
      return getOrchestratorStatus(requireLegacyStore(ctx), requireOrgId(ctx));
    }),

  listWorkflowDefs: publicProcedure
    .input(z.object({}))
    .output(z.array(WorkflowDefSchema))
    .query(async ({ ctx }) => {
      return listWorkflowDefs(requireLegacyStore(ctx), requireOrgId(ctx));
    }),

  upsertWorkflowDef: permissionedProcedure({ resource: "orchestration", action: "upsertWorkflowDef" })
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
      return upsertWorkflowDef(requireLegacyStore(ctx), {
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

  claimRun: permissionedProcedure({ resource: "orchestration", action: "claimRun" })
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
      return getSymphonyDriftReport(requireLegacyStore(ctx), requireOrgId(ctx), input.staleMinutes);
    }),

  // ---------------------------------------------------------------------------
  // dispatchRun — SND-06, SYM-25
  // Creates or updates an agent_runs row and queues the run for dispatch.
  // Uses MikroORM EM path (ARCH-12), not legacy SQL.
  // Protected by permissionedProcedure with explicit resource/action metadata.
  // ---------------------------------------------------------------------------
  dispatchRun: permissionedProcedure({ resource: "orchestration", action: "dispatchRun" })
    .input(
      z.object({
        taskId: z.string(),
        orgId: z.string().optional(),
        agentName: z.string().optional(),
        workflowPath: z.string().optional(),
        sandboxMode: z.string().optional(),
        projectId: z.string().optional(),
        includeGlobal: z.boolean().optional(),
        trustMode: z.enum(["manual", "assisted", "trusted", "full-auto"]).optional(),
      }),
    )
    .output(
      z.object({
        runId: z.string(),
        state: z.string(),
        agent: z.string(),
        sandboxMode: z.string(),
        transcriptPath: z.string().nullable().optional(),
        artifactCount: z.number().optional(),
        trace: z.object({
          taskId: z.string(),
          projectId: z.string(),
          repoId: z.string(),
          context: z.object({
            sourceRefs: z.array(z.object({
              kind: z.enum(["task", "doc", "memory", "run", "artifact"]),
              id: z.string(),
              reason: z.string(),
              scope: z.enum(["project", "global"]),
            })),
            includeGlobal: z.boolean(),
          }),
          routing: z.object({
            selectedAgent: z.string(),
            reason: z.enum(["explicit-agent", "default-agent"]),
          }),
          authority: z.object({
            trustMode: z.enum(["manual", "assisted", "trusted", "full-auto"]),
            approvalRequired: z.boolean(),
            reason: z.string(),
            sources: z.record(z.string(), z.enum(["manual", "assisted", "trusted", "full-auto"]).nullable()),
          }),
        }),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const manager = requireEm(ctx);
      const appCtx = {
        ...runsAppContext(ctx),
        orgId: inputOrgId(ctx, input.orgId),
        projectId: input.projectId ?? null,
      };
      const trace = await (async () => {
        try {
          return await buildDispatchTrace(manager, appCtx, {
            taskId: input.taskId,
            projectId: input.projectId ?? null,
            agentName: input.agentName,
            includeGlobal: input.includeGlobal,
            trustMode: input.trustMode,
          });
        } catch (error) {
          if (error instanceof AppError) throw appErrorToTrpcError(error);
          throw error;
        }
      })();
      const agentName = trace.routing.selectedAgent;
      const rawSandbox = input.sandboxMode ?? "noSandbox";
      const sandboxMode = rawSandbox === "docker" || rawSandbox === "podman" ? rawSandbox : "noSandbox";
      const run = await dispatchTaskRun(manager, appCtx, {
        taskId: input.taskId,
        agent: agentName,
      });

      return {
        runId: run.id,
        state: "unclaimed",
        agent: agentName,
        sandboxMode,
        transcriptPath: null,
        artifactCount: 0,
        trace,
      };
    }),
});

export type OrchestrationRouter = typeof orchestrationRouter;
