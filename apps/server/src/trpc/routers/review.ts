import { z } from "zod";

import { appErrorToTrpcError } from "@fulcrum/server/trpc/error-mapping.ts";
import { AppError } from "@platform-core/domain/errors.ts";
import { requireTrpcEntityManager } from "@fulcrum/server/trpc/context.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import type { AppContext } from "@work-management/application/tasks/types.ts";

const UatCodeReviewDecisionEnum = z.enum([
  "start_uat",
  "start_code_review",
  "request_changes",
  "approve_without_manual_review",
]);

const UatCodeReviewSessionTypeEnum = z.enum(["uat", "code_review"]);

const BuildUatHandoffInputSchema = z.object({
  projectId: z.string().trim().min(1),
  traceId: z.string().trim().min(1).optional(),
  taskIds: z.array(z.string().trim().min(1)).max(500).optional(),
}).strict();

const RecordUatDecisionInputSchema = z.object({
  projectId: z.string().trim().min(1),
  traceId: z.string().trim().min(1).optional(),
  decision: UatCodeReviewDecisionEnum,
  reviewType: UatCodeReviewSessionTypeEnum,
  feedbackText: z.string().trim().min(1).optional(),
  feedbackAgent: z.string().trim().min(1).nullable().optional(),
  feedbackModel: z.string().trim().min(1).nullable().optional(),
  taskIds: z.array(z.string().trim().min(1)).max(500).optional(),
  e2eRunner: z.enum(["bun", "playwright"]).optional(),
}).strict();

const ApplyAutoDecisionInputSchema = z.object({
  projectId: z.string().trim().min(1),
  traceId: z.string().trim().min(1).optional(),
  taskIds: z.array(z.string().trim().min(1)).max(500).optional(),
}).strict();

const reviewApplication = {
  buildUatCodeReviewHandoff: async (em: unknown, ctx: unknown, input: unknown) => {
    const mod = await import("@planning-review/interface/project-review-reports.ts");
    return mod.buildUatCodeReviewHandoff(em as never, ctx as never, input as never);
  },
  recordUatCodeReviewDecision: async (em: unknown, ctx: unknown, input: unknown) => {
    const mod = await import("@planning-review/interface/project-review-reports.ts");
    return mod.recordUatCodeReviewDecision(em as never, ctx as never, input as never);
  },
  applyConfiguredUatCodeReviewDecision: async (em: unknown, ctx: unknown, input: unknown) => {
    const mod = await import("@planning-review/interface/project-review-reports.ts");
    return mod.applyConfiguredUatCodeReviewDecision(em as never, ctx as never, input as never);
  },
};

export function __setReviewApplicationForTest(overrides: Partial<typeof reviewApplication>): () => void {
  const previous = { ...reviewApplication };
  Object.assign(reviewApplication, overrides);
  return () => Object.assign(reviewApplication, previous);
}

function appContext(ctx: { orgId: string; userId: string }, projectId?: string | null): AppContext {
  return { orgId: ctx.orgId, userId: ctx.userId, projectId: projectId ?? null };
}

async function mapAppError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

export const reviewRouter = t.router({
  buildUatHandoff: permissionedProcedure({
    resource: "review",
    action: "buildUatHandoff",
  })
    .input(BuildUatHandoffInputSchema)
    .query(({ ctx, input }) =>
      mapAppError(() =>
        reviewApplication.buildUatCodeReviewHandoff(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId),
          input,
        )
      )
    ),

  recordUatDecision: permissionedProcedure({
    resource: "review",
    action: "recordUatDecision",
  })
    .input(RecordUatDecisionInputSchema)
    .mutation(({ ctx, input }) =>
      mapAppError(() =>
        reviewApplication.recordUatCodeReviewDecision(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId),
          input,
        )
      )
    ),

  applyAutoDecision: permissionedProcedure({
    resource: "review",
    action: "applyAutoDecision",
  })
    .input(ApplyAutoDecisionInputSchema)
    .mutation(({ ctx, input }) =>
      mapAppError(() =>
        reviewApplication.applyConfiguredUatCodeReviewDecision(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId),
          input,
        )
      )
    ),
});

export type ReviewRouter = typeof reviewRouter;
