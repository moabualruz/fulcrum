import { afterEach, describe, expect, mock, test } from "bun:test";

import { createContext } from "@fulcrum/server/trpc/context.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { __setReviewApplicationForTest as __setReportsApplicationForTest } from "@fulcrum/server/trpc/routers/review.ts";
import type { EntityManager } from "typeorm";
import type {
  AppContext,
  ApplyConfiguredUatCodeReviewDecisionInput,
  BuildFinalQaReportInput,
  BuildUatCodeReviewHandoffInput,
  ConfiguredUatCodeReviewDecisionOutput,
  FinalQaReportOutput,
  GeneratedE2eRegressionRunOutput,
  RecordUatCodeReviewDecisionInput,
  RunGeneratedE2eRegressionTestsInput,
  UatCodeReviewDecisionOutput,
  UatCodeReviewHandoffOutput,
} from "@planning-review/domain/review-acceptance.ts";
import type { ReviewWorkbenchInput, ReviewWorkbenchModel } from "@planning-review/application/reviews/review-workbench.ts";
import type {
  BuildFinalQaFeedbackGateInput,
  FinalQaFeedbackGateOutput,
} from "@planning-review/application/reports/final-qa-feedback-gate.ts";
import type {
  AppendReviewWorkbenchAnnotationInput,
  LoadReviewWorkbenchSessionInput,
  ReviewWorkbenchSessionContext,
  ReviewWorkbenchSessionOutput,
  SaveReviewWorkbenchSessionInput,
} from "@planning-review/application/reviews/review-workbench-session-actions.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000010";
const PROJECT_ID = "99999999-9999-4999-8999-999999999999";

const buildFinalQaReport = mock(async (): Promise<FinalQaReportOutput> => ({
  projectId: PROJECT_ID,
  traceId: "trace-trpc-final-qa",
  status: "passed",
  readyForUserAcceptance: true,
  nextAction: "prompt_uat_code_review",
  summary: {
    taskCount: 1,
    docCount: 1,
    runCount: 1,
    artifactCount: 1,
    successCriteriaCount: 1,
    approvedTaskCount: 1,
    blockedTaskCount: 0,
    openFeedbackRunCount: 0,
  },
  checks: [],
  taskResults: [],
  markdown: "# Final QA Report\n\nStatus: passed",
}));

const buildUatCodeReviewHandoff = mock(async (): Promise<UatCodeReviewHandoffOutput> => ({
  projectId: PROJECT_ID,
  traceId: "trace-trpc-uat",
  status: "ready",
  finalQaStatus: "passed",
  nextAction: "prompt_user_for_uat_code_review",
  finalQa: await buildFinalQaReport(),
  reviewSessions: [{
    id: "uat-trace-trpc-uat",
    type: "uat",
    title: "User Acceptance Testing",
    status: "pending_user_decision",
    traceId: "trace-trpc-uat",
    taskIds: [],
    promptMarkdown: "# User Acceptance Testing",
  }],
  decisionOptions: [{
    id: "start_uat",
    label: "Start UAT",
    description: "Open UAT.",
  }],
  promptMarkdown: "# UAT And Code Review Handoff",
  eventId: "event-uat",
}));

const buildFinalQaFeedbackGate = mock(async (): Promise<FinalQaFeedbackGateOutput> => ({
  projectId: PROJECT_ID,
  traceId: "trace-trpc-feedback-gate",
  loopAttempted: true,
  initialFinalQa: {
    ...(await buildFinalQaReport()),
    status: "failed",
    readyForUserAcceptance: false,
    nextAction: "continue_automated_feedback",
    summary: {
      taskCount: 1,
      docCount: 1,
      runCount: 1,
      artifactCount: 1,
      successCriteriaCount: 1,
      approvedTaskCount: 0,
      blockedTaskCount: 0,
      openFeedbackRunCount: 1,
    },
  },
  feedbackLoop: {
    projectId: PROJECT_ID,
    traceId: "trace-trpc-feedback-gate",
    runGroupId: "trace-trpc-feedback-gate",
    iterations: 1,
    processedRuns: [{
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      taskId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "succeeded",
      output: "feedback complete",
    }],
    reviews: [],
    exhausted: false,
    stopReason: "reviewer_unavailable",
    feedback: {
      projectId: PROJECT_ID,
      traceId: "trace-trpc-feedback-gate",
      runGroupId: "trace-trpc-feedback-gate",
      fetchedAt: "2026-05-13T00:00:00.000Z",
      executorStatus: {
        queuedTaskCount: 0,
        runningTaskCount: 0,
        succeededTaskCount: 1,
        failedTaskCount: 0,
        blockedTaskCount: 0,
        inReviewCount: 0,
        active: false,
        lastActivityAt: "2026-05-13T00:00:00.000Z",
      },
      runs: [],
      events: [],
      latestEvent: null,
    },
  },
  finalQa: {
    ...(await buildFinalQaReport()),
    status: "failed",
    readyForUserAcceptance: false,
    nextAction: "continue_automated_feedback",
  },
  readyForUserAcceptance: false,
  nextAction: "continue_automated_feedback",
  eventId: "event-feedback-gate",
}));

const recordUatCodeReviewDecision = mock(async (): Promise<UatCodeReviewDecisionOutput> => ({
  projectId: PROJECT_ID,
  traceId: "trace-trpc-approval",
  decision: "approve_without_manual_review",
  reviewType: "uat",
  status: "approved",
  nextAction: "real_data_e2e_generated",
  handoff: await buildUatCodeReviewHandoff(),
  feedbackRuns: [],
  generatedE2eTests: [{
    artifactId: "artifact-generated-e2e",
    generationTaskId: "task-generated-e2e",
    filename: "uat-trace-trpc-approval.spec.ts",
    path: "generated/e2e/uat-trace-trpc-approval.spec.ts",
    runner: "playwright",
    storePath: "org/project/run/uat-trace-trpc-approval.spec.ts",
    bodyPath: "/tmp/fulcrum-artifacts/org/project/run/uat-trace-trpc-approval.spec.ts",
    mime: "text/typescript",
    body: "Trace trace-trpc-approval",
    sourceTaskIds: ["task-1"],
    sourceCriteria: ["UAT passes"],
    coverageCases: [{
      id: "task-1:1",
      taskId: "task-1",
      taskTitle: "UAT task",
      criterion: "UAT passes",
      artifactIds: ["artifact-proof"],
      runIds: ["run-proof"],
      latestReviewEventId: "event-review",
    }],
    manualSimulationChecklist: {
      id: "manual-simulation:trace-trpc-approval",
      projectId: PROJECT_ID,
      traceId: "trace-trpc-approval",
      status: "approved",
      steps: [{
        id: "task-1:manual-simulation:1",
        taskId: "task-1",
        taskTitle: "UAT task",
        criterion: "UAT passes",
        setup: "Open the workflow state for UAT task.",
        action: "Exercise the user-visible path for success criterion 1.",
        expectedObservation: "UAT passes",
        evidenceField: "evidence.task-1.1",
      }],
      e2eSeed: {
        sourceTaskIds: ["task-1"],
        sourceCriteria: ["UAT passes"],
        approvedForE2e: true,
      },
    },
    scenarioData: {
      traceId: "trace-trpc-approval",
      projectId: PROJECT_ID,
      taskId: "task-1",
      taskTitle: "UAT task",
      taskStatus: "done",
      latestReviewEventId: "event-review",
      evidenceArtifactIds: ["artifact-proof"],
      evidenceRunIds: ["run-proof"],
    },
    mockPolicy: {
      usesMocks: false,
      impossibilityReason: null,
    },
    ciCommand: ["bun", "run", "scripts/ci-generated-e2e.ts"],
    ciEnv: {
      FULCRUM_GENERATED_E2E_RUNNER: "playwright",
      FULCRUM_GENERATED_E2E_FILES: "/tmp/fulcrum-artifacts/org/project/run/uat-trace-trpc-approval.spec.ts",
    },
  }],
  eventId: "event-decision",
}));

const runGeneratedE2eRegressionTests = mock(async (): Promise<GeneratedE2eRegressionRunOutput> => ({
  projectId: PROJECT_ID,
  traceId: "trace-trpc-approval",
  runId: "generated-e2e-project-trpc-trace-trpc-approval-playwright",
  runner: "playwright",
  status: "planned",
  command: ["bun", "run", "web:e2e:generated", "--", "/tmp/fulcrum-artifacts/org/project/run/uat-trace-trpc-approval.spec.ts"],
  cwd: "apps/web",
  testFiles: ["/tmp/fulcrum-artifacts/org/project/run/uat-trace-trpc-approval.spec.ts"],
  artifactIds: ["artifact-generated-e2e"],
  generatedSpecArtifactIds: ["generated-e2e-project-trpc-trace-trpc-approval-playwright-spec-1"],
  stdout: "",
  stderr: "",
  exitCode: null,
  ciCommand: ["bun", "run", "scripts/ci-generated-e2e.ts"],
  ciEnv: {
    FULCRUM_GENERATED_E2E_RUNNER: "playwright",
    FULCRUM_GENERATED_E2E_FILES: "/tmp/fulcrum-artifacts/org/project/run/uat-trace-trpc-approval.spec.ts",
  },
  eventId: "event-e2e-run",
}));

const applyConfiguredUatCodeReviewDecision = mock(async (): Promise<ConfiguredUatCodeReviewDecisionOutput> => ({
  projectId: PROJECT_ID,
  traceId: "trace-trpc-auto",
  settingKey: "reports.uatCodeReviewAutoDecision",
  status: "applied",
  nextAction: "real_data_e2e_generated",
  config: {
    enabled: true,
    decision: "approve_without_manual_review",
    reviewType: "code_review",
    e2eRunner: "bun",
  },
  decision: await recordUatCodeReviewDecision(),
  eventId: "event-auto-decision",
}));

const buildReviewWorkbenchModel = mock((input: ReviewWorkbenchInput): ReviewWorkbenchModel => ({
  projectId: input.projectId,
  traceId: input.traceId,
  reviewId: input.reviewId,
  files: [{
    path: "src/app.ts",
    patch: "@@ -1 +1 @@\n+trace",
    additions: 1,
    deletions: 0,
    index: 0,
    viewed: false,
    active: true,
    annotationCount: (input.annotations ?? []).length,
    searchMatchCount: 1,
  }],
  visibleFiles: [{
    path: "src/app.ts",
    patch: "@@ -1 +1 @@\n+trace",
    additions: 1,
    deletions: 0,
    index: 0,
    viewed: false,
    active: true,
    annotationCount: (input.annotations ?? []).length,
    searchMatchCount: 1,
  }],
  selectedFile: {
    path: "src/app.ts",
    patch: "@@ -1 +1 @@\n+trace",
    additions: 1,
    deletions: 0,
    index: 0,
    viewed: false,
    active: true,
    annotationCount: (input.annotations ?? []).length,
    searchMatchCount: 1,
  },
  fileTree: [{
    type: "file",
    name: "app.ts",
    path: "src/app.ts",
    depth: 0,
    fileIndex: 0,
    additions: 1,
    deletions: 0,
  }],
  visualFileOrder: [0],
  fileTreeStats: new Map([["src/app.ts", {
    annotationCount: (input.annotations ?? []).length,
    searchMatchCount: 1,
    viewed: false,
  }]]),
  annotationGroups: (input.annotations ?? []).length > 0
    ? [{
      filePath: "src/app.ts",
      annotations: input.annotations ?? [],
      blockingCount: (input.annotations ?? []).filter((annotation) => annotation.decorations?.includes("blocking")).length,
      suggestionCount: (input.annotations ?? []).filter((annotation) => annotation.suggestedCode).length,
    }]
    : [],
  search: {
    query: input.searchQuery ?? "",
    matches: [{
      id: "src/app.ts:addition:1:0:0",
      filePath: "src/app.ts",
      side: "addition",
      lineNumber: 1,
      text: "trace",
      matchStart: 0,
      matchEnd: 5,
      snippet: "trace",
    }],
    groups: [{
      filePath: "src/app.ts",
      fileIndex: 0,
      matches: [{
        id: "src/app.ts:addition:1:0:0",
        filePath: "src/app.ts",
        side: "addition",
        lineNumber: 1,
        text: "trace",
        matchStart: 0,
        matchEnd: 5,
        snippet: "trace",
      }],
    }],
    activeMatch: null,
    previousMatchId: "src/app.ts:addition:1:0:0",
    nextMatchId: "src/app.ts:addition:1:0:0",
  },
  suggestions: (input.annotations ?? []).flatMap((annotation) =>
    annotation.suggestedCode
      ? [{
        annotationId: annotation.id,
        filePath: annotation.filePath,
        lineStart: annotation.lineStart,
        lineEnd: annotation.lineEnd,
        canApply: true,
        originalCode: annotation.originalCode,
        suggestedCode: annotation.suggestedCode,
      }]
      : []
  ),
  feedbackMarkdown: "# Code Review\n\nNo feedback provided.",
  submission: { targets: [], orphans: [] },
  liveLog: {
    displayText: "trace log",
    fullText: "trace log",
    isLive: false,
    hasOutput: true,
    isWaiting: false,
    truncated: false,
  },
  summary: {
    fileCount: 1,
    visibleFileCount: 1,
    viewedFileCount: 0,
    annotationCount: (input.annotations ?? []).length,
    blockingAnnotationCount: (input.annotations ?? [])
      .filter((annotation) => annotation.decorations?.includes("blocking")).length,
    suggestionCount: (input.annotations ?? []).filter((annotation) => annotation.suggestedCode).length,
    searchMatchCount: 1,
    hasLiveOutput: true,
  },
}));

const saveReviewWorkbenchSession = mock(async (
  em: EntityManager,
  ctx: ReviewWorkbenchSessionContext,
  input: SaveReviewWorkbenchSessionInput,
): Promise<ReviewWorkbenchSessionOutput> => ({
  projectId: input.projectId,
  traceId: input.traceId,
  reviewId: input.reviewId ?? "review-trpc-session",
  reviewType: input.reviewType ?? "code_review",
  title: input.title,
  status: "saved",
  revision: 1,
  eventId: "event-review-session-saved",
  model: buildReviewWorkbenchModel(input),
}));

const loadReviewWorkbenchSession = mock(async (
  em: EntityManager,
  ctx: ReviewWorkbenchSessionContext,
  input: LoadReviewWorkbenchSessionInput,
): Promise<ReviewWorkbenchSessionOutput> => ({
  projectId: input.projectId,
  traceId: input.traceId ?? "trace-trpc-review-session",
  reviewId: input.reviewId ?? "review-trpc-session",
  reviewType: "code_review",
  title: "Persisted code review",
  status: "loaded",
  revision: 2,
  eventId: "event-review-session-loaded",
  model: buildReviewWorkbenchModel({
    projectId: input.projectId,
    traceId: input.traceId ?? "trace-trpc-review-session",
    reviewId: input.reviewId ?? "review-trpc-session",
    files: [{
      path: "src/app.ts",
      patch: "@@ -1 +1 @@\n+trace",
      additions: 1,
      deletions: 0,
    }],
    annotations: [],
    searchQuery: input.searchQuery,
  }),
}));

const appendReviewWorkbenchAnnotation = mock(async (
  em: EntityManager,
  ctx: ReviewWorkbenchSessionContext,
  input: AppendReviewWorkbenchAnnotationInput,
): Promise<ReviewWorkbenchSessionOutput> => ({
  projectId: input.projectId,
  traceId: "trace-trpc-review-session",
  reviewId: input.reviewId ?? "review-trpc-session",
  reviewType: "code_review",
  title: "Persisted code review",
  status: "annotated",
  revision: 3,
  eventId: "event-review-annotation-added",
  model: buildReviewWorkbenchModel({
    projectId: input.projectId,
    traceId: "trace-trpc-review-session",
    reviewId: input.reviewId ?? "review-trpc-session",
    files: [{
      path: "src/app.ts",
      patch: "@@ -1 +1 @@\n+trace",
      additions: 1,
      deletions: 0,
    }],
    annotations: [{
      id: input.annotationId ?? "ann-trpc-added",
      type: input.type ?? "comment",
      filePath: input.filePath,
      lineStart: input.lineStart,
      lineEnd: input.lineEnd,
      side: input.side ?? "new",
      text: input.text,
      suggestedCode: input.suggestedCode,
      createdAt: 1,
    }],
    searchQuery: input.searchQuery,
  }),
}));

let restoreApplication: (() => void) | null = null;

afterEach(() => {
  restoreApplication?.();
  restoreApplication = null;
  buildFinalQaReport.mockClear();
  buildFinalQaFeedbackGate.mockClear();
  buildUatCodeReviewHandoff.mockClear();
  recordUatCodeReviewDecision.mockClear();
  runGeneratedE2eRegressionTests.mockClear();
  applyConfiguredUatCodeReviewDecision.mockClear();
  buildReviewWorkbenchModel.mockClear();
  saveReviewWorkbenchSession.mockClear();
  loadReviewWorkbenchSession.mockClear();
  appendReviewWorkbenchAnnotation.mockClear();
});

function caller() {
  restoreApplication = __setReportsApplicationForTest({
    buildFinalQaReport: buildFinalQaReport as never,
    buildFinalQaFeedbackGate: buildFinalQaFeedbackGate as never,
    buildUatCodeReviewHandoff: buildUatCodeReviewHandoff as never,
    recordUatCodeReviewDecision: recordUatCodeReviewDecision as never,
    runGeneratedE2eRegressionTests: runGeneratedE2eRegressionTests as never,
    applyConfiguredUatCodeReviewDecision: applyConfiguredUatCodeReviewDecision as never,
    buildReviewWorkbenchModel: buildReviewWorkbenchModel as never,
    saveReviewWorkbenchSession: saveReviewWorkbenchSession as never,
    loadReviewWorkbenchSession: loadReviewWorkbenchSession as never,
    appendReviewWorkbenchAnnotation: appendReviewWorkbenchAnnotation as never,
  });
  const createCaller = t.createCallerFactory(appRouter);
  return createCaller(createContext({
    session: {
      id: "session",
      token: "session",
      userId: USER_ID,
      orgId: ORG_ID,
      activeOrganizationId: ORG_ID,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    } as never,
    orgId: ORG_ID,
    userId: USER_ID,
    em: { marker: "reports-trpc-em" } as never,
    container: null,
  }));
}

describe("reports final QA tRPC", () => {
  test("delegates final QA report building to shared application action with project and trace scope", async () => {
    const trpc = caller();

    const result = await trpc.review.finalQa({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-final-qa",
      taskIds: ["task-final-qa"],
    });

    expect(result).toMatchObject({
      projectId: PROJECT_ID,
      status: "passed",
      readyForUserAcceptance: true,
      nextAction: "prompt_uat_code_review",
    });
    expect(buildFinalQaReport).toHaveBeenCalledTimes(1);
    const [em, appCtx, input] = buildFinalQaReport.mock.calls[0] as unknown as [
      unknown,
      AppContext,
      BuildFinalQaReportInput,
    ];
    expect(em).toEqual({ marker: "reports-trpc-em" });
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(input).toEqual({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-final-qa",
      taskIds: ["task-final-qa"],
    });
  });

  test("delegates final QA feedback gate to shared application action with loop options", async () => {
    const trpc = caller();

    const result = await trpc.review.finalQaFeedbackGate({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-feedback-gate",
      taskIds: ["task-feedback"],
      workerId: "worker-trpc",
      reviewerAgent: "qa-reviewer",
      feedbackAgent: "codex",
      feedbackModel: "gpt-feedback",
      maxIterations: 3,
      cwd: "/repo",
      copyToWorktree: ["services/planning-review"],
    });

    expect(result).toMatchObject({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-feedback-gate",
      loopAttempted: true,
      readyForUserAcceptance: false,
      nextAction: "continue_automated_feedback",
      feedbackLoop: {
        stopReason: "reviewer_unavailable",
      },
    });
    expect(buildFinalQaFeedbackGate).toHaveBeenCalledTimes(1);
    const [em, appCtx, input] = buildFinalQaFeedbackGate.mock.calls[0] as unknown as [
      unknown,
      AppContext,
      BuildFinalQaFeedbackGateInput,
    ];
    expect(em).toEqual({ marker: "reports-trpc-em" });
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(input).toEqual({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-feedback-gate",
      taskIds: ["task-feedback"],
      workerId: "worker-trpc",
      reviewerAgent: "qa-reviewer",
      feedbackAgent: "codex",
      feedbackModel: "gpt-feedback",
      maxIterations: 3,
      cwd: "/repo",
      copyToWorktree: ["services/planning-review"],
    });
  });

  test("delegates UAT/code review handoff to shared application action with project and trace scope", async () => {
    const trpc = caller();

    const result = await trpc.review.uatCodeReviewHandoff({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-uat",
    });

    expect(result).toMatchObject({
      projectId: PROJECT_ID,
      status: "ready",
      finalQaStatus: "passed",
      nextAction: "prompt_user_for_uat_code_review",
    });
    expect(buildUatCodeReviewHandoff).toHaveBeenCalledTimes(1);
    const [em, appCtx, input] = buildUatCodeReviewHandoff.mock.calls[0] as unknown as [
      unknown,
      AppContext,
      BuildUatCodeReviewHandoffInput,
    ];
    expect(em).toEqual({ marker: "reports-trpc-em" });
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(input).toEqual({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-uat",
    });
  });

  test("delegates UAT/code review decisions to shared application action with project and trace scope", async () => {
    const trpc = caller();

    const result = await trpc.review.recordUatCodeReviewDecision({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-approval",
      decision: "approve_without_manual_review",
      reviewType: "uat",
      feedbackText: "Approved.",
      e2eRunner: "playwright",
    });

    expect(result).toMatchObject({
      projectId: PROJECT_ID,
      status: "approved",
      nextAction: "real_data_e2e_generated",
      generatedE2eTests: [{
        filename: "uat-trace-trpc-approval.spec.ts",
      }],
    });
    expect(recordUatCodeReviewDecision).toHaveBeenCalledTimes(1);
    const [em, appCtx, input] = recordUatCodeReviewDecision.mock.calls[0] as unknown as [
      unknown,
      AppContext,
      RecordUatCodeReviewDecisionInput,
    ];
    expect(em).toEqual({ marker: "reports-trpc-em" });
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(input).toEqual({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-approval",
      decision: "approve_without_manual_review",
      reviewType: "uat",
      feedbackText: "Approved.",
      e2eRunner: "playwright",
    });
  });

  test("delegates generated E2E regression runs to shared application action with project and trace scope", async () => {
    const trpc = caller();

    const result = await trpc.review.runGeneratedE2eRegressionTests({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-approval",
      taskIds: ["task-e2e"],
      runner: "playwright",
      planOnly: true,
    });

    expect(result).toMatchObject({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-approval",
      runner: "playwright",
      status: "planned",
      command: ["bun", "run", "web:e2e:generated", "--", "/tmp/fulcrum-artifacts/org/project/run/uat-trace-trpc-approval.spec.ts"],
      cwd: "apps/web",
    });
    expect(runGeneratedE2eRegressionTests).toHaveBeenCalledTimes(1);
    const [em, appCtx, input] = runGeneratedE2eRegressionTests.mock.calls[0] as unknown as [
      unknown,
      AppContext,
      RunGeneratedE2eRegressionTestsInput,
    ];
    expect(em).toEqual({ marker: "reports-trpc-em" });
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(input).toEqual({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-approval",
      taskIds: ["task-e2e"],
      runner: "playwright",
      planOnly: true,
    });
  });

  test("delegates configured auto-decisions to shared application action with project and trace scope", async () => {
    const trpc = caller();

    const result = await trpc.review.applyConfiguredUatCodeReviewDecision({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-auto",
      taskIds: ["11111111-1111-4111-8111-111111111111"],
    });

    expect(result).toMatchObject({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-auto",
      status: "applied",
      nextAction: "real_data_e2e_generated",
      decision: {
        status: "approved",
      },
    });
    expect(applyConfiguredUatCodeReviewDecision).toHaveBeenCalledTimes(1);
    const [em, appCtx, input] = applyConfiguredUatCodeReviewDecision.mock.calls[0] as unknown as [
      unknown,
      AppContext,
      ApplyConfiguredUatCodeReviewDecisionInput,
    ];
    expect(em).toEqual({ marker: "reports-trpc-em" });
    expect(appCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(input).toEqual({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-auto",
      taskIds: ["11111111-1111-4111-8111-111111111111"],
    });
  });

  test("delegates review workbench building to shared review workbench application model", async () => {
    const trpc = caller();

    const result = await trpc.review.reviewWorkbench({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-review",
      reviewId: "review-trpc-1",
      files: [{
        path: "src/app.ts",
        patch: "@@ -1 +1 @@\n+trace",
        additions: 1,
        deletions: 0,
      }],
      annotations: [],
      searchQuery: "trace",
      liveLog: { content: "trace log" },
    });

    expect(result).toMatchObject({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-review",
      reviewId: "review-trpc-1",
      summary: { searchMatchCount: 1 },
      fileTreeStats: {
        "src/app.ts": { searchMatchCount: 1, viewed: false },
      },
    });
    expect(buildReviewWorkbenchModel).toHaveBeenCalledTimes(1);
    expect(buildReviewWorkbenchModel.mock.calls[0]?.[0]).toMatchObject({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-review",
      reviewId: "review-trpc-1",
      searchQuery: "trace",
    });
  });

  test("delegates persisted review workbench sessions to shared application actions", async () => {
    const trpc = caller();

    const saved = await trpc.review.saveReviewWorkbenchSession({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-review-session",
      reviewId: "review-trpc-session",
      reviewType: "code_review",
      title: "Persisted code review",
      files: [{
        path: "src/app.ts",
        patch: "@@ -1 +1 @@\n+trace",
        additions: 1,
        deletions: 0,
      }],
      annotations: [],
      searchQuery: "trace",
    });

    expect(saved).toMatchObject({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-review-session",
      reviewId: "review-trpc-session",
      status: "saved",
      revision: 1,
      model: {
        fileTreeStats: {
          "src/app.ts": { searchMatchCount: 1 },
        },
      },
    });
    expect(saveReviewWorkbenchSession).toHaveBeenCalledTimes(1);
    const [saveEm, saveCtx, saveInput] = saveReviewWorkbenchSession.mock.calls[0] as unknown as [
      unknown,
      AppContext,
      Record<string, unknown>,
    ];
    expect(saveEm).toEqual({ marker: "reports-trpc-em" });
    expect(saveCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(saveInput).toMatchObject({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-review-session",
      reviewId: "review-trpc-session",
      reviewType: "code_review",
      title: "Persisted code review",
      searchQuery: "trace",
    });

    const loaded = await trpc.review.loadReviewWorkbenchSession({
      projectId: PROJECT_ID,
      reviewId: "review-trpc-session",
      searchQuery: "trace",
    });

    expect(loaded).toMatchObject({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-review-session",
      reviewId: "review-trpc-session",
      status: "loaded",
      revision: 2,
      model: {
        summary: { searchMatchCount: 1 },
      },
    });
    expect(loadReviewWorkbenchSession).toHaveBeenCalledTimes(1);
    const [loadEm, loadCtx, loadInput] = loadReviewWorkbenchSession.mock.calls[0] as unknown as [
      unknown,
      AppContext,
      Record<string, unknown>,
    ];
    expect(loadEm).toEqual({ marker: "reports-trpc-em" });
    expect(loadCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(loadInput).toEqual({
      projectId: PROJECT_ID,
      reviewId: "review-trpc-session",
      searchQuery: "trace",
    });

    const annotated = await trpc.review.appendReviewWorkbenchAnnotation({
      projectId: PROJECT_ID,
      reviewId: "review-trpc-session",
      annotationId: "ann-trpc-added",
      type: "suggestion",
      filePath: "src/app.ts",
      lineStart: 1,
      lineEnd: 1,
      side: "new",
      text: "Add inline review note.",
      suggestedCode: "trace()",
      searchQuery: "inline",
    });

    expect(annotated).toMatchObject({
      projectId: PROJECT_ID,
      traceId: "trace-trpc-review-session",
      reviewId: "review-trpc-session",
      status: "annotated",
      revision: 3,
      model: {
        summary: { annotationCount: 1, suggestionCount: 1 },
      },
    });
    expect(appendReviewWorkbenchAnnotation).toHaveBeenCalledTimes(1);
    const [annotateEm, annotateCtx, annotateInput] = appendReviewWorkbenchAnnotation.mock.calls[0] as unknown as [
      unknown,
      AppContext,
      Record<string, unknown>,
    ];
    expect(annotateEm).toEqual({ marker: "reports-trpc-em" });
    expect(annotateCtx).toEqual({ orgId: ORG_ID, userId: USER_ID, projectId: PROJECT_ID });
    expect(annotateInput).toMatchObject({
      projectId: PROJECT_ID,
      reviewId: "review-trpc-session",
      annotationId: "ann-trpc-added",
      type: "suggestion",
      filePath: "src/app.ts",
      lineStart: 1,
      lineEnd: 1,
      text: "Add inline review note.",
      suggestedCode: "trace()",
      searchQuery: "inline",
    });
  });
});
