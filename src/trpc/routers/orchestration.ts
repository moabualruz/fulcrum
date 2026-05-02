/**
 * Orchestration tRPC router.
 *
 * Internal surface consumed by Web, CLI, and TUI callers. Business logic stays
 * in src/orchestration/symphony/tracker.ts.
 */

import { TRPCError } from "@trpc/server";

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
