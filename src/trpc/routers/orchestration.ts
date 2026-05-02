/**
 * Orchestration tRPC router.
 *
 * Internal surface consumed by Web, CLI, and TUI callers. Business logic stays
 * in src/orchestration/symphony/tracker.ts.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure } from "../middleware.ts";
import { t } from "../trpc.ts";
import {
  AgentRunIssueListSchema,
  CandidateIssueListSchema,
  FetchCandidateIssuesInputSchema,
  FetchIssuesByStatesInputSchema,
  FetchIssueStatesByIdsInputSchema,
  GetWorkspacePathInputSchema,
  IssueStateListSchema,
  WorkspacePathSchema,
  WorkflowConfigSchema,
} from "../../orchestration/symphony/schemas.ts";
import { ClaimConflictError } from "../../orchestration/symphony/orchestrator.ts";

const OrgIdInputSchema = z.object({
  orgId: z.string().min(1),
});

const OrchestratorStatusSchema = z.object({
  running: z.number().int(),
  queued: z.number().int(),
  stalled: z.number().int(),
});

const ClaimRunInputSchema = z.object({
  orgId: z.string().min(1),
  taskId: z.string().min(1),
  instanceId: z.string().min(1),
});

const ClaimRunOutputSchema = z.object({
  runId: z.string().min(1),
});

const PromptPreviewIssueSchema = z.object({
  id: z.string(),
}).passthrough();

const RenderPromptPreviewInputSchema = z.object({
  orgId: z.string(),
  promptMd: z.string(),
  configYaml: z.string().default(""),
  issue: PromptPreviewIssueSchema,
  attempt: z.number().int().nullable().default(null),
});

const RenderPromptPreviewOutputSchema = z.object({
  prompt: z.string(),
  config: WorkflowConfigSchema,
});

const GetRunInputSchema = z.object({
  runId: z.string(),
});

const RunDetailSchema = z.object({
  id: z.string(),
  state: z.string().nullable(),
  orchestrationState: z.string().nullable(),
  workspacePath: z.string().nullable(),
  renderedPrompt: z.string().nullable(),
  attemptCount: z.number().int(),
  nextRetryAt: z.date().nullable(),
  lastErrorKind: z.string().nullable(),
});

export const orchestrationRouter = t.router({
  list: protectedProcedure.query(() => []),

  fetchCandidateIssues: protectedProcedure
    .input(FetchCandidateIssuesInputSchema)
    .output(CandidateIssueListSchema)
    .query(async ({ ctx, input }) => {
      if (input.orgId !== ctx.orgId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot fetch candidate issues for another org.",
        });
      }

      if (!ctx.em) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "MikroORM EntityManager is required.",
        });
      }

      const { fetchCandidateIssues } = await import(
        "../../orchestration/symphony/tracker.ts"
      );
      return fetchCandidateIssues(ctx.em, input.orgId, input.limit);
    }),

  fetchIssuesByStates: protectedProcedure
    .input(FetchIssuesByStatesInputSchema)
    .output(AgentRunIssueListSchema)
    .query(async ({ ctx, input }) => {
      ensureOrg(ctx.orgId, input.orgId);
      const em = ensureEntityManager(ctx.em);
      const { fetchIssuesByStates } = await import(
        "../../orchestration/symphony/tracker.ts"
      );
      return fetchIssuesByStates(em, input.orgId, input.states, input.limit);
    }),

  fetchIssueStatesByIds: protectedProcedure
    .input(FetchIssueStatesByIdsInputSchema)
    .output(IssueStateListSchema)
    .query(async ({ ctx, input }) => {
      ensureOrg(ctx.orgId, input.orgId);
      const em = ensureEntityManager(ctx.em);
      const { fetchIssueStatesByIds } = await import(
        "../../orchestration/symphony/tracker.ts"
      );
      return fetchIssueStatesByIds(em, input.orgId, input.runIds);
    }),

  getWorkspacePath: protectedProcedure
    .input(GetWorkspacePathInputSchema)
    .output(WorkspacePathSchema)
    .query(async ({ ctx, input }) => {
      ensureOrg(ctx.orgId, input.orgId);
      const em = ensureEntityManager(ctx.em);
      const { getWorkspacePath } = await import(
        "../../orchestration/symphony/workspace.ts"
      );
      return getWorkspacePath(em, input.orgId, input.runId);
    }),

  getRun: protectedProcedure
    .input(GetRunInputSchema)
    .output(RunDetailSchema.nullable())
    .query(async ({ ctx, input }) => {
      const em = ensureEntityManager(ctx.em);
      const orgId = ctx.orgId;
      if (!orgId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Authenticated org context required",
        });
      }

      const [{ AgentRun }, { Org }] = await Promise.all([
        import("../../db/entities/orchestration/AgentRun.ts"),
        import("../../db/entities/auth/Org.ts"),
      ]);
      const fork = em.fork();
      const org = fork.getReference(Org, orgId);
      const run = await fork.findOne(AgentRun, {
        id: input.runId,
        org,
      }, {
        fields: [
          "id",
          "orchestrationState",
          "workspacePath",
          "attemptCount",
          "nextRetryAt",
          "lastErrorKind",
        ],
      });
      if (!run) return null;

      return {
        id: run.id,
        state: run.orchestrationState ?? null,
        orchestrationState: run.orchestrationState ?? null,
        workspacePath: run.workspacePath ?? null,
        renderedPrompt: null,
        attemptCount: run.attemptCount,
        nextRetryAt: run.nextRetryAt ?? null,
        lastErrorKind: run.lastErrorKind ?? null,
      };
    }),

  renderPromptPreview: protectedProcedure
    .input(RenderPromptPreviewInputSchema)
    .output(RenderPromptPreviewOutputSchema)
    .query(async ({ ctx, input }) => {
      ensureOrg(ctx.orgId, input.orgId);
      // Keep DB-entity decorators out of SvelteKit postbuild analysis; import
      // prompt helpers only when this procedure actually runs.
      const { parseWorkflowConfig, renderPrompt } = await import(
        "../../orchestration/symphony/prompt.ts"
      );
      const config = parseWorkflowConfig(input.configYaml);
      const prompt = await renderPrompt(
        {
          id: "preview",
          promptMd: input.promptMd,
          configYaml: input.configYaml,
        },
        {
          issue: input.issue,
          attempt: input.attempt,
        },
      );

      return { prompt, config };
    }),

  getOrchestratorStatus: protectedProcedure
    .input(OrgIdInputSchema)
    .output(OrchestratorStatusSchema)
    .query(async ({ ctx, input }) => {
      ensureOrg(ctx.orgId, input.orgId);
      const em = ensureEntityManager(ctx.em);
      const { fetchIssuesByStates } = await import(
        "../../orchestration/symphony/tracker.ts"
      );
      const [running, queued, stalled] = await Promise.all([
        fetchIssuesByStates(em, input.orgId, ["running"], 500),
        fetchIssuesByStates(em, input.orgId, ["unclaimed", "claimed", "retry_queued"], 500),
        fetchIssuesByStates(em, input.orgId, ["stalled"], 500),
      ]);
      return {
        running: running.length,
        queued: queued.length,
        stalled: stalled.length,
      };
    }),

  claimRun: protectedProcedure
    .input(ClaimRunInputSchema)
    .output(ClaimRunOutputSchema)
    .mutation(async ({ ctx, input }) => {
      ensureOrg(ctx.orgId, input.orgId);
      const em = ensureEntityManager(ctx.em);

      const { claimRun } = await import(
        "../../orchestration/symphony/orchestrator.ts"
      );

      try {
        return await claimRun(em, input.orgId, input.taskId, input.instanceId);
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
});

export type OrchestrationRouter = typeof orchestrationRouter;

function ensureOrg(contextOrgId: string | null, inputOrgId: string): void {
  if (inputOrgId !== contextOrgId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cannot fetch orchestration records for another org.",
    });
  }
}

function ensureEntityManager<T>(em: T | null): T {
  if (!em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "MikroORM EntityManager is required.",
    });
  }

  return em;
}
