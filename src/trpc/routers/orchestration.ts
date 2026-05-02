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
  CandidateIssueListSchema,
  fetchCandidateIssues,
  FetchCandidateIssuesInputSchema,
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
});

export type OrchestrationRouter = typeof orchestrationRouter;
