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

const FinalQaInputSchema = z.object({
  projectId: z.string().trim().min(1),
  traceId: z.string().trim().min(1).optional(),
}).strict();

const FinalQaFeedbackGateInputSchema = z.object({
  projectId: z.string().trim().min(1),
  traceId: z.string().trim().min(1).optional(),
  workerId: z.string().trim().min(1).optional(),
  feedbackAgent: z.string().trim().min(1).optional(),
  feedbackModel: z.string().trim().min(1).optional(),
  maxIterations: z.number().int().min(1).max(20).optional(),
  cwd: z.string().trim().min(1).optional(),
}).strict();

const RunGeneratedE2eInputSchema = z.object({
  projectId: z.string().trim().min(1),
  traceId: z.string().trim().min(1).optional(),
  runner: z.enum(["bun", "playwright"]).optional(),
  planOnly: z.boolean().optional(),
}).strict();

const AnnotationSideEnum = z.enum(["old", "new"]);

const ReviewWorkbenchFileSchema = z.object({
  path: z.string().trim().min(1),
  patch: z.string(),
  additions: z.number().int().min(0),
  deletions: z.number().int().min(0),
});

const ReviewWorkbenchAnnotationSchema = z.object({
  id: z.string().trim().min(1),
  type: z.string().trim().min(1),
  filePath: z.string().trim().min(1),
  lineStart: z.number().int(),
  lineEnd: z.number().int(),
  side: AnnotationSideEnum.optional(),
  text: z.string(),
  originalCode: z.string().optional(),
  suggestedCode: z.string().optional(),
  decorations: z.array(z.string()).optional(),
  createdAt: z.number().optional(),
});

const ReviewWorkbenchInputSchema = z.object({
  projectId: z.string().trim().min(1),
  traceId: z.string().trim().min(1),
  reviewId: z.string().trim().min(1),
  files: z.array(ReviewWorkbenchFileSchema),
  annotations: z.array(ReviewWorkbenchAnnotationSchema).optional(),
  searchQuery: z.string().optional(),
  liveLog: z.object({ content: z.string() }).optional(),
}).strict();

const SaveReviewWorkbenchSessionInputSchema = z.object({
  projectId: z.string().trim().min(1),
  traceId: z.string().trim().min(1).optional(),
  reviewId: z.string().trim().min(1).optional(),
  reviewType: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  files: z.array(ReviewWorkbenchFileSchema),
  annotations: z.array(ReviewWorkbenchAnnotationSchema).optional(),
  searchQuery: z.string().optional(),
}).strict();

const LoadReviewWorkbenchSessionInputSchema = z.object({
  projectId: z.string().trim().min(1),
  traceId: z.string().trim().min(1).optional(),
  reviewId: z.string().trim().min(1).optional(),
  searchQuery: z.string().optional(),
}).strict();

const AppendReviewWorkbenchAnnotationInputSchema = z.object({
  projectId: z.string().trim().min(1),
  reviewId: z.string().trim().min(1).optional(),
  annotationId: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1).optional(),
  filePath: z.string().trim().min(1),
  lineStart: z.number().int(),
  lineEnd: z.number().int(),
  side: AnnotationSideEnum.optional(),
  text: z.string(),
  originalCode: z.string().optional(),
  suggestedCode: z.string().optional(),
  searchQuery: z.string().optional(),
}).strict();

const reviewApplication = {
  buildFinalQaReport: async (em: unknown, ctx: unknown, input: unknown) => {
    const mod = await import("@planning-review/interface/project-review-reports.ts");
    return mod.buildFinalQaReport(em as never, ctx as never, input as never);
  },
  buildFinalQaFeedbackGate: async (em: unknown, ctx: unknown, input: unknown) => {
    const mod = await import("@planning-review/interface/project-review-reports.ts");
    return mod.buildFinalQaFeedbackGate(em as never, ctx as never, input as never);
  },
  buildUatCodeReviewHandoff: async (em: unknown, ctx: unknown, input: unknown) => {
    const mod = await import("@planning-review/interface/project-review-reports.ts");
    return mod.buildUatCodeReviewHandoff(em as never, ctx as never, input as never);
  },
  recordUatCodeReviewDecision: async (em: unknown, ctx: unknown, input: unknown) => {
    const mod = await import("@planning-review/interface/project-review-reports.ts");
    return mod.recordUatCodeReviewDecision(em as never, ctx as never, input as never);
  },
  runGeneratedE2eRegressionTests: async (em: unknown, ctx: unknown, input: unknown) => {
    const mod = await import("@planning-review/interface/project-review-reports.ts");
    return mod.runGeneratedE2eRegressionTests(em as never, ctx as never, input as never);
  },
  applyConfiguredUatCodeReviewDecision: async (em: unknown, ctx: unknown, input: unknown) => {
    const mod = await import("@planning-review/interface/project-review-reports.ts");
    return mod.applyConfiguredUatCodeReviewDecision(em as never, ctx as never, input as never);
  },
  buildReviewWorkbenchModel: async (input: unknown) => {
    const mod = await import("@planning-review/interface/project-review-reports.ts");
    return mod.buildReviewWorkbenchModel(input as never);
  },
  saveReviewWorkbenchSession: async (em: unknown, ctx: unknown, input: unknown) => {
    const mod = await import("@planning-review/interface/project-review-reports.ts");
    return mod.saveReviewWorkbenchSession(em as never, ctx as never, input as never);
  },
  loadReviewWorkbenchSession: async (em: unknown, ctx: unknown, input: unknown) => {
    const mod = await import("@planning-review/interface/project-review-reports.ts");
    return mod.loadReviewWorkbenchSession(em as never, ctx as never, input as never);
  },
  appendReviewWorkbenchAnnotation: async (em: unknown, ctx: unknown, input: unknown) => {
    const mod = await import("@planning-review/interface/project-review-reports.ts");
    return mod.appendReviewWorkbenchAnnotation(em as never, ctx as never, input as never);
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
  finalQa: permissionedProcedure({
    resource: "review",
    action: "finalQa",
  })
    .input(FinalQaInputSchema)
    .query(({ ctx, input }) =>
      mapAppError(() =>
        reviewApplication.buildFinalQaReport(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId),
          input,
        )
      )
    ),

  finalQaFeedbackGate: permissionedProcedure({
    resource: "review",
    action: "finalQaFeedbackGate",
  })
    .input(FinalQaFeedbackGateInputSchema)
    .mutation(({ ctx, input }) =>
      mapAppError(() =>
        reviewApplication.buildFinalQaFeedbackGate(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId),
          input,
        )
      )
    ),

  uatCodeReviewHandoff: permissionedProcedure({
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

  recordUatCodeReviewDecision: permissionedProcedure({
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

  runGeneratedE2eRegressionTests: permissionedProcedure({
    resource: "review",
    action: "runGeneratedE2eRegressionTests",
  })
    .input(RunGeneratedE2eInputSchema)
    .mutation(({ ctx, input }) =>
      mapAppError(() =>
        reviewApplication.runGeneratedE2eRegressionTests(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId),
          input,
        )
      )
    ),

  applyConfiguredUatCodeReviewDecision: permissionedProcedure({
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

  reviewWorkbench: permissionedProcedure({
    resource: "review",
    action: "reviewWorkbench",
  })
    .input(ReviewWorkbenchInputSchema)
    .query(async ({ input }) => {
      const model = await reviewApplication.buildReviewWorkbenchModel(input);
      // Convert Map to plain object for JSON serialization
      const fileTreeStats: Record<string, unknown> = {};
      if (model.fileTreeStats instanceof Map) {
        for (const [k, v] of model.fileTreeStats) {
          fileTreeStats[k] = v;
        }
      }
      return { ...model, fileTreeStats };
    }),

  saveReviewWorkbenchSession: permissionedProcedure({
    resource: "review",
    action: "saveReviewWorkbenchSession",
  })
    .input(SaveReviewWorkbenchSessionInputSchema)
    .mutation(({ ctx, input }) =>
      mapAppError(async () => {
        const result = await reviewApplication.saveReviewWorkbenchSession(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId),
          input,
        );
        // Convert Map to plain object for JSON serialization
        if (result.model?.fileTreeStats instanceof Map) {
          const fileTreeStats: Record<string, unknown> = {};
          for (const [k, v] of result.model.fileTreeStats) {
            fileTreeStats[k] = v;
          }
          return { ...result, model: { ...result.model, fileTreeStats } };
        }
        return result;
      })
    ),

  loadReviewWorkbenchSession: permissionedProcedure({
    resource: "review",
    action: "loadReviewWorkbenchSession",
  })
    .input(LoadReviewWorkbenchSessionInputSchema)
    .query(({ ctx, input }) =>
      mapAppError(async () => {
        const result = await reviewApplication.loadReviewWorkbenchSession(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId),
          input,
        );
        if (result.model?.fileTreeStats instanceof Map) {
          const fileTreeStats: Record<string, unknown> = {};
          for (const [k, v] of result.model.fileTreeStats) {
            fileTreeStats[k] = v;
          }
          return { ...result, model: { ...result.model, fileTreeStats } };
        }
        return result;
      })
    ),

  appendReviewWorkbenchAnnotation: permissionedProcedure({
    resource: "review",
    action: "appendReviewWorkbenchAnnotation",
  })
    .input(AppendReviewWorkbenchAnnotationInputSchema)
    .mutation(({ ctx, input }) =>
      mapAppError(async () => {
        const result = await reviewApplication.appendReviewWorkbenchAnnotation(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId),
          input,
        );
        if (result.model?.fileTreeStats instanceof Map) {
          const fileTreeStats: Record<string, unknown> = {};
          for (const [k, v] of result.model.fileTreeStats) {
            fileTreeStats[k] = v;
          }
          return { ...result, model: { ...result.model, fileTreeStats } };
        }
        return result;
      })
    ),
});

export type ReviewRouter = typeof reviewRouter;
