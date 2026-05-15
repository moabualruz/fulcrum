/**
 * Reports sub-router — Pillar 6, Issue 20 (burndown chart).
 *
 * `reports.burndown({projectId, sprintId})` returns `{date, pointsRemaining, ideal}[]`.
 * Reads from `metrics_cache`; falls back to on-demand computation when cache is empty.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { buildFinalQaReport } from "@planning-review/application/reports/final-qa-actions.ts";
import { buildFinalQaFeedbackGate } from "@planning-review/application/reports/final-qa-feedback-gate.ts";
import { runGeneratedE2eRegressionTests } from "@planning-review/application/reports/generated-e2e-run-actions.ts";
import { getSprintBurndown } from "@work-management/application/reports/queries.ts";
import { applyConfiguredUatCodeReviewDecision } from "@planning-review/application/reports/uat-auto-decision-actions.ts";
import { recordUatCodeReviewDecision } from "@planning-review/application/reports/uat-decision-actions.ts";
import { buildUatCodeReviewHandoff } from "@planning-review/application/reports/uat-handoff-actions.ts";
import type { AppContext } from "@planning-review/domain/review-acceptance.ts";
import { buildReviewWorkbenchModel } from "@planning-review/application/reviews/review-workbench.ts";
import {
  appendReviewWorkbenchAnnotation,
  loadReviewWorkbenchSession,
  saveReviewWorkbenchSession,
} from "@planning-review/application/reviews/review-workbench-session-actions.ts";
import { permissionedProcedure } from "../middleware.ts";
import { t } from "../trpc.ts";
import { AutomatedFeedbackLoopOutputSchema } from "@work-management/application/tasks/schema.ts";

type EntityManager = import("typeorm").EntityManager;

const BurndownInputSchema = z.object({
  projectId: z.uuid(),
  sprintId: z.uuid(),
});

const BurndownPointSchema = z.object({
  date: z.string(),
  pointsRemaining: z.number(),
  ideal: z.number(),
});

const BurndownOutputSchema = z.array(BurndownPointSchema);

const FinalQaInputSchema = z.object({
  projectId: z.uuid(),
  traceId: z.string().optional(),
  taskIds: z.array(z.string().uuid()).optional(),
});

const FinalQaFeedbackGateInputSchema = FinalQaInputSchema.extend({
  workerId: z.string().trim().min(1).nullable().optional(),
  reviewerAgent: z.string().trim().min(1).nullable().optional(),
  feedbackAgent: z.string().trim().min(1).nullable().optional(),
  feedbackModel: z.string().trim().min(1).nullable().optional(),
  maxIterations: z.number().int().positive().max(50).nullable().optional(),
  cwd: z.string().trim().min(1).nullable().optional(),
  copyToWorktree: z.array(z.string().trim().min(1)).nullable().optional(),
});

const FinalQaCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(["pass", "fail", "warn"]),
  details: z.string(),
  subjectKind: z.enum(["project", "task", "doc", "agent_run", "artifact"]).optional(),
  subjectId: z.string().nullable().optional(),
});

const FinalQaTaskResultSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  status: z.string().nullable(),
  successCriteria: z.array(z.string()),
  latestVerdict: z.enum(["APPROVE", "REVISE", "RETHINK", "UNAVAILABLE"]).nullable(),
  latestReviewEventId: z.string().nullable(),
  unresolvedDependencyIds: z.array(z.string()),
  runIds: z.array(z.string()),
  openFeedbackRunIds: z.array(z.string()),
  artifactIds: z.array(z.string()),
});

const FinalQaOutputSchema = z.object({
  projectId: z.string(),
  traceId: z.string().optional(),
  status: z.enum(["passed", "failed"]),
  readyForUserAcceptance: z.boolean(),
  nextAction: z.enum(["prompt_uat_code_review", "continue_automated_feedback", "manual_review_required"]),
  summary: z.object({
    taskCount: z.number(),
    docCount: z.number(),
    runCount: z.number(),
    artifactCount: z.number(),
    successCriteriaCount: z.number(),
    approvedTaskCount: z.number(),
    blockedTaskCount: z.number(),
    openFeedbackRunCount: z.number(),
  }),
  checks: z.array(FinalQaCheckSchema),
  taskResults: z.array(FinalQaTaskResultSchema),
  markdown: z.string(),
});

const UatCodeReviewSessionSchema = z.object({
  id: z.string(),
  type: z.enum(["uat", "code_review"]),
  title: z.string(),
  status: z.enum(["pending_user_decision"]),
  traceId: z.string().optional(),
  taskIds: z.array(z.string()),
  promptMarkdown: z.string(),
});

const UatCodeReviewDecisionOptionSchema = z.object({
  id: z.enum([
    "start_uat",
    "start_code_review",
    "request_changes",
    "approve_without_manual_review",
    "continue_automated_feedback",
    "manual_review_required",
  ]),
  label: z.string(),
  description: z.string(),
});

const UatCodeReviewHandoffOutputSchema = z.object({
  projectId: z.string(),
  traceId: z.string().optional(),
  status: z.enum(["ready", "blocked"]),
  finalQaStatus: z.enum(["passed", "failed"]),
  nextAction: z.enum([
    "prompt_user_for_uat_code_review",
    "prompt_uat_code_review",
    "continue_automated_feedback",
    "manual_review_required",
  ]),
  finalQa: FinalQaOutputSchema,
  reviewSessions: z.array(UatCodeReviewSessionSchema),
  decisionOptions: z.array(UatCodeReviewDecisionOptionSchema),
  promptMarkdown: z.string(),
  eventId: z.string(),
});

const FinalQaFeedbackGateOutputSchema = z.object({
  projectId: z.string(),
  traceId: z.string().optional(),
  loopAttempted: z.boolean(),
  initialFinalQa: FinalQaOutputSchema,
  feedbackLoop: AutomatedFeedbackLoopOutputSchema.nullable(),
  finalQa: FinalQaOutputSchema,
  readyForUserAcceptance: z.boolean(),
  nextAction: z.enum(["prompt_uat_code_review", "continue_automated_feedback", "manual_review_required"]),
  eventId: z.string(),
});

const RecordUatCodeReviewDecisionInputSchema = z.object({
  projectId: z.uuid(),
  traceId: z.string().optional(),
  decision: z.enum(["start_uat", "start_code_review", "request_changes", "approve_without_manual_review"]),
  reviewType: z.enum(["uat", "code_review"]),
  feedbackText: z.string().optional(),
  feedbackAgent: z.string().nullable().optional(),
  feedbackModel: z.string().nullable().optional(),
  taskIds: z.array(z.string().uuid()).optional(),
  e2eRunner: z.enum(["bun", "playwright"]).optional(),
});

const RunGeneratedE2eRegressionTestsInputSchema = z.object({
  projectId: z.uuid(),
  traceId: z.string().optional(),
  runner: z.enum(["bun", "playwright"]).optional(),
  planOnly: z.boolean().optional(),
});

const GeneratedE2eCoverageCaseSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  taskTitle: z.string(),
  criterion: z.string(),
  artifactIds: z.array(z.string()),
  runIds: z.array(z.string()),
  latestReviewEventId: z.string().nullable(),
});

const UatCodeReviewDecisionOutputSchema = z.object({
  projectId: z.string(),
  traceId: z.string().optional(),
  decision: z.enum(["start_uat", "start_code_review", "request_changes", "approve_without_manual_review"]),
  reviewType: z.enum(["uat", "code_review"]),
  status: z.enum(["review_started", "changes_requested", "approved", "blocked"]),
  nextAction: z.enum([
    "await_user_feedback",
    "feedback_run_scheduled",
    "real_data_e2e_generated",
    "manual_review_required",
  ]),
  handoff: UatCodeReviewHandoffOutputSchema,
  feedbackRuns: z.array(z.object({
    id: z.string(),
    taskId: z.string(),
    agent: z.string(),
    status: z.string(),
  })),
  generatedE2eTests: z.array(z.object({
    artifactId: z.string(),
    filename: z.string(),
    path: z.string(),
    runner: z.enum(["bun", "playwright"]),
    storePath: z.string(),
    bodyPath: z.string(),
    mime: z.string(),
    body: z.string(),
    sourceTaskIds: z.array(z.string()),
    sourceCriteria: z.array(z.string()),
    coverageCases: z.array(GeneratedE2eCoverageCaseSchema),
    ciCommand: z.array(z.string()),
    ciEnv: z.record(z.string(), z.string()),
  })),
  eventId: z.string(),
});

const UatCodeReviewAutoDecisionConfigSchema = z.object({
  enabled: z.boolean(),
  decision: z.enum(["start_uat", "start_code_review", "request_changes", "approve_without_manual_review"]),
  reviewType: z.enum(["uat", "code_review"]),
  feedbackText: z.string().optional(),
  feedbackAgent: z.string().nullable().optional(),
  feedbackModel: z.string().nullable().optional(),
  taskIds: z.array(z.string()).optional(),
  e2eRunner: z.enum(["bun", "playwright"]).optional(),
});

const ConfiguredUatCodeReviewDecisionOutputSchema = z.object({
  projectId: z.string(),
  traceId: z.string().optional(),
  settingKey: z.string(),
  status: z.enum(["not_configured", "disabled", "applied", "blocked"]),
  nextAction: z.enum([
    "configure_auto_decision",
    "manual_review_required",
    "await_user_feedback",
    "feedback_run_scheduled",
    "real_data_e2e_generated",
  ]),
  config: UatCodeReviewAutoDecisionConfigSchema.nullable(),
  decision: UatCodeReviewDecisionOutputSchema.nullable(),
  eventId: z.string(),
});

const GeneratedE2eRegressionRunOutputSchema = z.object({
  projectId: z.string(),
  traceId: z.string().optional(),
  runner: z.enum(["bun", "playwright"]),
  status: z.enum(["passed", "failed", "planned"]),
  command: z.array(z.string()),
  cwd: z.string().optional(),
  testFiles: z.array(z.string()),
  artifactIds: z.array(z.string()),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().nullable(),
  ciCommand: z.array(z.string()),
  ciEnv: z.record(z.string(), z.string()),
  eventId: z.string(),
});

const ReviewWorkbenchDiffFileSchema = z.object({
  path: z.string(),
  oldPath: z.string().optional(),
  patch: z.string(),
  additions: z.number(),
  deletions: z.number(),
});

const CodeReviewAnnotationSchema = z.object({
  id: z.string(),
  type: z.enum(["comment", "suggestion", "concern"]),
  scope: z.enum(["line", "file"]).optional(),
  filePath: z.string(),
  lineStart: z.number(),
  lineEnd: z.number(),
  side: z.enum(["old", "new"]),
  text: z.string().optional(),
  suggestedCode: z.string().optional(),
  originalCode: z.string().optional(),
  charStart: z.number().optional(),
  charEnd: z.number().optional(),
  tokenText: z.string().optional(),
  createdAt: z.number(),
  author: z.string().optional(),
  source: z.string().optional(),
  severity: z.enum(["important", "nit", "pre_existing"]).optional(),
  reasoning: z.string().optional(),
  conventionalLabel: z.string().optional(),
  decorations: z.array(z.enum(["blocking", "non-blocking", "if-minor"])).optional(),
  prUrl: z.string().optional(),
  prNumber: z.number().optional(),
  prTitle: z.string().optional(),
  prRepo: z.string().optional(),
  diffScope: z.enum(["layer", "full-stack"]).optional(),
});

const ReviewWorkbenchEditorAnnotationSchema = z.object({
  filePath: z.string(),
  lineStart: z.number(),
  lineEnd: z.number(),
  comment: z.string().optional(),
  selectedText: z.string().optional(),
});

const ReviewWorkbenchInputSchema = z.object({
  projectId: z.string().optional(),
  traceId: z.string().optional(),
  reviewId: z.string().optional(),
  files: z.array(ReviewWorkbenchDiffFileSchema),
  annotations: z.array(CodeReviewAnnotationSchema),
  selectedFilePath: z.string().nullable().optional(),
  viewedFilePaths: z.array(z.string()).optional(),
  hideViewedFiles: z.boolean().optional(),
  searchQuery: z.string().optional(),
  activeSearchMatchId: z.string().nullable().optional(),
  liveLog: z.object({
    content: z.string(),
    isLive: z.boolean().optional(),
    maxRenderSize: z.number().optional(),
  }).optional(),
  editorAnnotations: z.array(ReviewWorkbenchEditorAnnotationSchema).optional(),
  currentPrUrl: z.string().optional(),
  currentPrMeta: z.object({
    number: z.number(),
    title: z.string(),
    repo: z.string(),
  }).optional(),
});

const SaveReviewWorkbenchSessionInputSchema = ReviewWorkbenchInputSchema.extend({
  projectId: z.uuid(),
  reviewType: z.enum(["plan", "uat", "code_review"]).optional(),
  title: z.string().optional(),
});

const LoadReviewWorkbenchSessionInputSchema = z.object({
  projectId: z.uuid(),
  reviewId: z.string().optional(),
  traceId: z.string().optional(),
  selectedFilePath: z.string().nullable().optional(),
  viewedFilePaths: z.array(z.string()).optional(),
  hideViewedFiles: z.boolean().optional(),
  searchQuery: z.string().optional(),
  activeSearchMatchId: z.string().nullable().optional(),
}).refine((input) => input.reviewId || input.traceId, {
  message: "reviewId or traceId is required",
});

const AppendReviewWorkbenchAnnotationInputSchema = z.object({
  projectId: z.uuid(),
  reviewId: z.string().optional(),
  traceId: z.string().optional(),
  annotationId: z.string().optional(),
  type: z.enum(["comment", "suggestion", "concern"]).optional(),
  scope: z.enum(["line", "file"]).optional(),
  filePath: z.string(),
  lineStart: z.number(),
  lineEnd: z.number(),
  side: z.enum(["old", "new"]).optional(),
  text: z.string().optional(),
  suggestedCode: z.string().optional(),
  originalCode: z.string().optional(),
  severity: z.enum(["important", "nit", "pre_existing"]).optional(),
  conventionalLabel: z.string().optional(),
  decorations: z.array(z.enum(["blocking", "non-blocking", "if-minor"])).optional(),
  author: z.string().optional(),
  source: z.string().optional(),
  createdAt: z.number().optional(),
  selectedFilePath: z.string().nullable().optional(),
  viewedFilePaths: z.array(z.string()).optional(),
  hideViewedFiles: z.boolean().optional(),
  searchQuery: z.string().optional(),
  activeSearchMatchId: z.string().nullable().optional(),
}).refine((input) => input.reviewId || input.traceId, {
  message: "reviewId or traceId is required",
});

const ReviewWorkbenchFileStateSchema = ReviewWorkbenchDiffFileSchema.extend({
  index: z.number(),
  viewed: z.boolean(),
  active: z.boolean(),
  annotationCount: z.number(),
  searchMatchCount: z.number(),
});

const FileTreeNodeSchema: z.ZodTypeAny = z.lazy(() =>
  z.object({
    type: z.enum(["file", "folder"]),
    name: z.string(),
    path: z.string(),
    depth: z.number(),
    fileIndex: z.number().optional(),
    file: ReviewWorkbenchDiffFileSchema.optional(),
    children: z.array(FileTreeNodeSchema).optional(),
    additions: z.number(),
    deletions: z.number(),
  })
);

const ReviewWorkbenchTreeStatsSchema = z.object({
  annotationCount: z.number(),
  searchMatchCount: z.number(),
  viewed: z.boolean(),
});

const ReviewSearchMatchSchema = z.object({
  id: z.string(),
  filePath: z.string(),
  side: z.enum(["addition", "deletion", "context"]),
  lineNumber: z.number(),
  altLineNumber: z.number().optional(),
  text: z.string(),
  matchStart: z.number(),
  matchEnd: z.number(),
  snippet: z.string(),
});

const ReviewWorkbenchSubmissionTargetSchema = z.object({
  prUrl: z.string(),
  prNumber: z.number(),
  prTitle: z.string(),
  prRepo: z.string(),
  fileComments: z.array(z.object({
    path: z.string(),
    line: z.number(),
    side: z.enum(["LEFT", "RIGHT"]),
    body: z.string(),
    start_line: z.number().optional(),
    start_side: z.enum(["LEFT", "RIGHT"]).optional(),
  })),
  fileScopedBody: z.string(),
  fileCount: z.number(),
  annotationCount: z.number(),
  status: z.enum(["pending", "success", "failed"]),
  error: z.string().optional(),
});

const ReviewWorkbenchOutputSchema = z.object({
  projectId: z.string().optional(),
  traceId: z.string().optional(),
  reviewId: z.string().optional(),
  files: z.array(ReviewWorkbenchFileStateSchema),
  visibleFiles: z.array(ReviewWorkbenchFileStateSchema),
  selectedFile: ReviewWorkbenchFileStateSchema.nullable(),
  fileTree: z.array(FileTreeNodeSchema),
  visualFileOrder: z.array(z.number()),
  fileTreeStats: z.record(z.string(), ReviewWorkbenchTreeStatsSchema),
  annotationGroups: z.array(z.object({
    filePath: z.string(),
    annotations: z.array(CodeReviewAnnotationSchema),
    blockingCount: z.number(),
    suggestionCount: z.number(),
  })),
  search: z.object({
    query: z.string(),
    matches: z.array(ReviewSearchMatchSchema),
    groups: z.array(z.object({
      filePath: z.string(),
      fileIndex: z.number(),
      matches: z.array(ReviewSearchMatchSchema),
    })),
    activeMatch: ReviewSearchMatchSchema.nullable(),
    previousMatchId: z.string().nullable(),
    nextMatchId: z.string().nullable(),
  }),
  suggestions: z.array(z.object({
    annotationId: z.string(),
    filePath: z.string(),
    lineStart: z.number(),
    lineEnd: z.number(),
    canApply: z.boolean(),
    originalCode: z.string().optional(),
    suggestedCode: z.string(),
  })),
  feedbackMarkdown: z.string(),
  submission: z.object({
    targets: z.array(ReviewWorkbenchSubmissionTargetSchema),
    orphans: z.array(z.object({
      reason: z.enum(["full-stack", "unmapped"]),
      annotations: z.array(CodeReviewAnnotationSchema),
      markdown: z.string(),
    })),
  }),
  liveLog: z.object({
    displayText: z.string(),
    fullText: z.string(),
    isLive: z.boolean(),
    hasOutput: z.boolean(),
    isWaiting: z.boolean(),
    truncated: z.boolean(),
  }),
  summary: z.object({
    fileCount: z.number(),
    visibleFileCount: z.number(),
    viewedFileCount: z.number(),
    annotationCount: z.number(),
    blockingAnnotationCount: z.number(),
    suggestionCount: z.number(),
    searchMatchCount: z.number(),
    hasLiveOutput: z.boolean(),
  }),
});

const ReviewWorkbenchSessionOutputSchema = z.object({
  projectId: z.string(),
  traceId: z.string().optional(),
  reviewId: z.string(),
  reviewType: z.enum(["plan", "uat", "code_review"]),
  title: z.string().optional(),
  status: z.enum(["saved", "loaded", "annotated"]),
  revision: z.number(),
  eventId: z.string(),
  model: ReviewWorkbenchOutputSchema,
});

const reportsApplication = {
  buildFinalQaReport,
  buildFinalQaFeedbackGate,
  buildUatCodeReviewHandoff,
  recordUatCodeReviewDecision,
  runGeneratedE2eRegressionTests,
  applyConfiguredUatCodeReviewDecision,
  buildReviewWorkbenchModel,
  saveReviewWorkbenchSession,
  loadReviewWorkbenchSession,
  appendReviewWorkbenchAnnotation,
};

export function __setReportsApplicationForTest(overrides: Partial<typeof reportsApplication>): () => void {
  const previous = { ...reportsApplication };
  Object.assign(reportsApplication, overrides);
  return () => Object.assign(reportsApplication, previous);
}

function requireEm(context: { em: EntityManager | null }): EntityManager {
  if (!context.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager required for reports.",
    });
  }
  return context.em;
}

function serializeReviewWorkbenchModel(model: ReturnType<typeof buildReviewWorkbenchModel>) {
  return {
    ...model,
    fileTreeStats: Object.fromEntries(model.fileTreeStats),
  };
}

function serializeReviewWorkbenchSessionOutput(
  output: Awaited<ReturnType<typeof saveReviewWorkbenchSession | typeof loadReviewWorkbenchSession | typeof appendReviewWorkbenchAnnotation>>,
) {
  return {
    ...output,
    model: serializeReviewWorkbenchModel(output.model),
  };
}

export interface BurndownPoint {
  date: string;
  pointsRemaining: number;
  ideal: number;
}

export const reportsRouter = t.router({
  burndown: permissionedProcedure({ resource: "reports", action: "burndown" })
    .input(BurndownInputSchema)
    .output(BurndownOutputSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      return getSprintBurndown(em, { orgId: ctx.orgId, userId: ctx.userId }, input);
    }),

  finalQa: permissionedProcedure({ resource: "reports", action: "finalQa" })
    .input(FinalQaInputSchema)
    .output(FinalQaOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const appCtx: AppContext = { orgId: ctx.orgId, userId: ctx.userId, projectId: input.projectId };
      return reportsApplication.buildFinalQaReport(em, appCtx, input);
    }),

  finalQaFeedbackGate: permissionedProcedure({ resource: "reports", action: "finalQaFeedbackGate" })
    .input(FinalQaFeedbackGateInputSchema)
    .output(FinalQaFeedbackGateOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const appCtx: AppContext = { orgId: ctx.orgId, userId: ctx.userId, projectId: input.projectId };
      return reportsApplication.buildFinalQaFeedbackGate(em, appCtx, input);
    }),

  uatCodeReviewHandoff: permissionedProcedure({ resource: "reports", action: "uatCodeReviewHandoff" })
    .input(FinalQaInputSchema)
    .output(UatCodeReviewHandoffOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const appCtx: AppContext = { orgId: ctx.orgId, userId: ctx.userId, projectId: input.projectId };
      return reportsApplication.buildUatCodeReviewHandoff(em, appCtx, input);
    }),

  recordUatCodeReviewDecision: permissionedProcedure({ resource: "reports", action: "recordUatCodeReviewDecision" })
    .input(RecordUatCodeReviewDecisionInputSchema)
    .output(UatCodeReviewDecisionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const appCtx: AppContext = { orgId: ctx.orgId, userId: ctx.userId, projectId: input.projectId };
      return reportsApplication.recordUatCodeReviewDecision(em, appCtx, input);
    }),

  runGeneratedE2eRegressionTests: permissionedProcedure({ resource: "reports", action: "runGeneratedE2eRegressionTests" })
    .input(RunGeneratedE2eRegressionTestsInputSchema)
    .output(GeneratedE2eRegressionRunOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const appCtx: AppContext = { orgId: ctx.orgId, userId: ctx.userId, projectId: input.projectId };
      return reportsApplication.runGeneratedE2eRegressionTests(em, appCtx, input);
    }),

  applyConfiguredUatCodeReviewDecision: permissionedProcedure({ resource: "reports", action: "applyConfiguredUatCodeReviewDecision" })
    .input(FinalQaInputSchema)
    .output(ConfiguredUatCodeReviewDecisionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const appCtx: AppContext = { orgId: ctx.orgId, userId: ctx.userId, projectId: input.projectId };
      return reportsApplication.applyConfiguredUatCodeReviewDecision(em, appCtx, input);
    }),

  reviewWorkbench: permissionedProcedure({ resource: "reports", action: "reviewWorkbench" })
    .input(ReviewWorkbenchInputSchema)
    .output(ReviewWorkbenchOutputSchema)
    .query(({ input }) => serializeReviewWorkbenchModel(reportsApplication.buildReviewWorkbenchModel(input))),

  saveReviewWorkbenchSession: permissionedProcedure({ resource: "reports", action: "saveReviewWorkbenchSession" })
    .input(SaveReviewWorkbenchSessionInputSchema)
    .output(ReviewWorkbenchSessionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const appCtx: AppContext = { orgId: ctx.orgId, userId: ctx.userId, projectId: input.projectId };
      return serializeReviewWorkbenchSessionOutput(
        await reportsApplication.saveReviewWorkbenchSession(em, appCtx, input),
      );
    }),

  loadReviewWorkbenchSession: permissionedProcedure({ resource: "reports", action: "loadReviewWorkbenchSession" })
    .input(LoadReviewWorkbenchSessionInputSchema)
    .output(ReviewWorkbenchSessionOutputSchema)
    .query(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const appCtx: AppContext = { orgId: ctx.orgId, userId: ctx.userId, projectId: input.projectId };
      return serializeReviewWorkbenchSessionOutput(
        await reportsApplication.loadReviewWorkbenchSession(em, appCtx, input),
      );
    }),

  appendReviewWorkbenchAnnotation: permissionedProcedure({ resource: "reports", action: "appendReviewWorkbenchAnnotation" })
    .input(AppendReviewWorkbenchAnnotationInputSchema)
    .output(ReviewWorkbenchSessionOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEm(ctx);
      const appCtx: AppContext = { orgId: ctx.orgId, userId: ctx.userId, projectId: input.projectId };
      return serializeReviewWorkbenchSessionOutput(
        await reportsApplication.appendReviewWorkbenchAnnotation(em, appCtx, input),
      );
    }),
});

export type ReportsRouter = typeof reportsRouter;
