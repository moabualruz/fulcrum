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
  fetchIssueStatesByIds,
  fetchCandidateIssues,
  fetchIssuesByStates,
  FetchIssueStatesByIdsInputSchema,
  FetchCandidateIssuesInputSchema,
  FetchIssuesByStatesInputSchema,
  IssueStateListSchema,
} from "../../orchestration/symphony/tracker.ts";
import {
  getWorkspacePath,
  GetWorkspacePathInputSchema,
  WorkspacePathSchema,
} from "../../orchestration/symphony/workspace.ts";
import {
  parseWorkflowConfig,
  renderPrompt,
  WorkflowConfigSchema,
} from "../../orchestration/symphony/prompt.ts";

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

      return fetchCandidateIssues(ctx.em, input.orgId, input.limit);
    }),

  fetchIssuesByStates: protectedProcedure
    .input(FetchIssuesByStatesInputSchema)
    .output(AgentRunIssueListSchema)
    .query(async ({ ctx, input }) => {
      ensureOrg(ctx.orgId, input.orgId);
      const em = ensureEntityManager(ctx.em);
      return fetchIssuesByStates(em, input.orgId, input.states, input.limit);
    }),

  fetchIssueStatesByIds: protectedProcedure
    .input(FetchIssueStatesByIdsInputSchema)
    .output(IssueStateListSchema)
    .query(async ({ ctx, input }) => {
      ensureOrg(ctx.orgId, input.orgId);
      const em = ensureEntityManager(ctx.em);
      return fetchIssueStatesByIds(em, input.orgId, input.runIds);
    }),

  getWorkspacePath: protectedProcedure
    .input(GetWorkspacePathInputSchema)
    .output(WorkspacePathSchema)
    .query(async ({ ctx, input }) => {
      ensureOrg(ctx.orgId, input.orgId);
      const em = ensureEntityManager(ctx.em);
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

      const { AgentRun } = await import("../../db/entities/orchestration/AgentRun.ts");
      const run = await em.fork().findOne(AgentRun, {
        id: input.runId,
        org: orgId,
      } as never, {
        fields: ["id", "orchestrationState", "workspacePath"],
      });
      if (!run) return null;

      return {
        id: run.id,
        state: run.orchestrationState ?? null,
        orchestrationState: run.orchestrationState ?? null,
        workspacePath: run.workspacePath ?? null,
        renderedPrompt: null,
      };
    }),

  renderPromptPreview: protectedProcedure
    .input(RenderPromptPreviewInputSchema)
    .output(RenderPromptPreviewOutputSchema)
    .query(async ({ ctx, input }) => {
      ensureOrg(ctx.orgId, input.orgId);
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
