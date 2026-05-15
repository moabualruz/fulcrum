import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { validateSync } from "class-validator";

import {
  ReviewWorkbenchController,
  FinalQaReportRequestDto,
  FinalQaFeedbackGateRequestDto,
  ConfiguredUatCodeReviewDecisionRequestDto,
  GeneratedE2eRegressionRunRequestDto,
  ReviewWorkbenchRequestDto,
  ReviewWorkbenchSessionAnnotateRequestDto,
  ReviewWorkbenchSessionLoadRequestDto,
  ReviewWorkbenchSessionSaveRequestDto,
  UatCodeReviewDecisionRequestDto,
  UatCodeReviewHandoffRequestDto,
} from "@workflow-coordination/interface/http/review-workbench.controller.ts";
import {
  ReviewWorkbenchService,
  type ConfiguredUatCodeReviewDecision,
  type FinalQaReport,
  type FinalQaFeedbackGate,
  type GeneratedE2eRegressionRun,
  type ReviewWorkbenchSession,
  type UatCodeReviewDecision,
  type UatCodeReviewHandoff,
  type ReviewWorkbenchPreview,
} from "@workflow-coordination/application/review-workbench.service.ts";
import { WorkflowCycleModule } from "@workflow-coordination/interface/http/workflow-cycle.module.ts";

function validWorkbenchInput(): ReviewWorkbenchRequestDto {
  return Object.assign(new ReviewWorkbenchRequestDto(), {
    projectId: "project-review-api",
    traceId: "trace-review-api",
    reviewId: "review-api",
    files: [
      {
        path: "src/app/main.ts",
        patch: [
          "diff --git a/src/app/main.ts b/src/app/main.ts",
          "@@ -1,2 +1,2 @@",
          '-  return "old";',
          '+  return traceId;',
        ].join("\n"),
        additions: 1,
        deletions: 1,
      },
    ],
    annotations: [
      {
        id: "ann-api",
        type: "suggestion",
        filePath: "src/app/main.ts",
        lineStart: 2,
        lineEnd: 2,
        side: "new",
        text: "Use the trace-linked value.",
        originalCode: 'return "old";',
        suggestedCode: "return traceId;",
        createdAt: 1,
      },
    ],
    selectedFilePath: "src/app/main.ts",
    searchQuery: "trace",
    liveLog: { content: "review started\ntrace ready", isLive: true },
  });
}

describe("Review workbench Nest controller", () => {
  test("is wired as a Nest API controller on the workflows module", () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, WorkflowCycleModule) as unknown[];

    expect(controllers).toContain(ReviewWorkbenchController);
    expect(Reflect.getMetadata(PATH_METADATA, ReviewWorkbenchController)).toBe("workflows/review");
    expect(Reflect.getMetadata(PATH_METADATA, ReviewWorkbenchController.prototype.previewWorkbench)).toBe(
      "workbench/preview",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ReviewWorkbenchController.prototype.previewWorkbench)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, ReviewWorkbenchController.prototype.buildFinalQaReport)).toBe(
      "final-qa/report",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ReviewWorkbenchController.prototype.buildFinalQaReport)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, ReviewWorkbenchController.prototype.buildFinalQaFeedbackGate)).toBe(
      "final-qa/feedback-gate",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ReviewWorkbenchController.prototype.buildFinalQaFeedbackGate)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, ReviewWorkbenchController.prototype.buildUatCodeReviewHandoff)).toBe(
      "uat-code-review/handoff",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ReviewWorkbenchController.prototype.buildUatCodeReviewHandoff)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, ReviewWorkbenchController.prototype.recordUatCodeReviewDecision)).toBe(
      "uat-code-review/decision/record",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ReviewWorkbenchController.prototype.recordUatCodeReviewDecision)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, ReviewWorkbenchController.prototype.applyConfiguredUatCodeReviewDecision)).toBe(
      "uat-code-review/decision/apply-configured",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ReviewWorkbenchController.prototype.applyConfiguredUatCodeReviewDecision)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, ReviewWorkbenchController.prototype.runGeneratedE2eRegressionTests)).toBe(
      "generated-e2e/run",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ReviewWorkbenchController.prototype.runGeneratedE2eRegressionTests)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, ReviewWorkbenchController.prototype.saveReviewWorkbenchSession)).toBe(
      "workbench/session/save",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ReviewWorkbenchController.prototype.saveReviewWorkbenchSession)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, ReviewWorkbenchController.prototype.loadReviewWorkbenchSession)).toBe(
      "workbench/session/load",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ReviewWorkbenchController.prototype.loadReviewWorkbenchSession)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(PATH_METADATA, ReviewWorkbenchController.prototype.appendReviewWorkbenchAnnotation)).toBe(
      "workbench/session/annotate",
    );
    expect(Reflect.getMetadata(METHOD_METADATA, ReviewWorkbenchController.prototype.appendReviewWorkbenchAnnotation)).toBe(
      RequestMethod.POST,
    );
  });

  test("delegates review workbench preview to the server-owned review service", async () => {
    const input = validWorkbenchInput();
    const preview: ReviewWorkbenchPreview = {
      projectId: input.projectId,
      traceId: input.traceId,
      reviewId: input.reviewId,
      files: [],
      visibleFiles: [],
      selectedFile: null,
      fileTree: [],
      visualFileOrder: [],
      fileTreeStats: new Map(),
      annotationGroups: [],
      search: { query: "", matches: [], groups: [], activeMatch: null, previousMatchId: null, nextMatchId: null },
      suggestions: [],
      feedbackMarkdown: "",
      submission: { targets: [], orphans: [] },
      liveLog: { displayText: "", fullText: "", isLive: false, hasOutput: false, isWaiting: true, truncated: false },
      summary: {
        fileCount: 0,
        visibleFileCount: 0,
        viewedFileCount: 0,
        annotationCount: 0,
        blockingAnnotationCount: 0,
        suggestionCount: 0,
        searchMatchCount: 0,
        hasLiveOutput: false,
      },
    };
    const service = {
      seen: undefined as ReviewWorkbenchRequestDto | undefined,
      async previewWorkbench(body: ReviewWorkbenchRequestDto) {
        this.seen = body;
        return preview;
      },
      async buildFinalQaReport() {
        throw new Error("unexpected final QA call");
      },
      async buildFinalQaFeedbackGate() {
        throw new Error("unexpected final QA feedback gate call");
      },
      async buildUatCodeReviewHandoff() {
        throw new Error("unexpected UAT handoff call");
      },
      async recordUatCodeReviewDecision() {
        throw new Error("unexpected UAT decision call");
      },
      async applyConfiguredUatCodeReviewDecision() {
        throw new Error("unexpected auto-decision call");
      },
      async runGeneratedE2eRegressionTests() {
        throw new Error("unexpected generated E2E run call");
      },
      async saveReviewWorkbenchSession() {
        throw new Error("unexpected session save call");
      },
      async loadReviewWorkbenchSession() {
        throw new Error("unexpected session load call");
      },
      async appendReviewWorkbenchAnnotation() {
        throw new Error("unexpected session annotate call");
      },
    };
    const controller = new ReviewWorkbenchController(service);

    await expect(controller.previewWorkbench(input)).resolves.toBe(preview);
    expect(service.seen).toBe(input);
  });

  test("delegates final QA report building to the server-owned review service", async () => {
    const input = Object.assign(new FinalQaReportRequestDto(), {
      workspaceId: "workspace-review-api",
      workspaceSlug: "review-api",
      workspaceName: "Review API",
      projectId: "project-review-api",
      projectSlug: "review-api",
      projectName: "Review Project",
      traceId: "trace-review-api",
      taskIds: ["task-review-api"],
    });
    const report: FinalQaReport = {
      projectId: "project-review-api",
      traceId: "trace-review-api",
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
      markdown: "# Final QA Report",
    };
    const service = {
      seen: undefined as FinalQaReportRequestDto | undefined,
      async previewWorkbench() {
        throw new Error("unexpected workbench call");
      },
      async buildFinalQaReport(body: FinalQaReportRequestDto) {
        this.seen = body;
        return report;
      },
      async buildFinalQaFeedbackGate() {
        throw new Error("unexpected final QA feedback gate call");
      },
      async buildUatCodeReviewHandoff() {
        throw new Error("unexpected UAT handoff call");
      },
      async recordUatCodeReviewDecision() {
        throw new Error("unexpected UAT decision call");
      },
      async applyConfiguredUatCodeReviewDecision() {
        throw new Error("unexpected auto-decision call");
      },
      async runGeneratedE2eRegressionTests() {
        throw new Error("unexpected generated E2E run call");
      },
      async saveReviewWorkbenchSession() {
        throw new Error("unexpected session save call");
      },
      async loadReviewWorkbenchSession() {
        throw new Error("unexpected session load call");
      },
      async appendReviewWorkbenchAnnotation() {
        throw new Error("unexpected session annotate call");
      },
    };
    const controller = new ReviewWorkbenchController(service);

    await expect(controller.buildFinalQaReport(input)).resolves.toBe(report);
    expect(service.seen).toBe(input);
  });

  test("delegates final QA feedback gates to the server-owned review service", async () => {
    const input = Object.assign(new FinalQaFeedbackGateRequestDto(), {
      workspaceId: "workspace-review-api",
      workspaceSlug: "review-api",
      workspaceName: "Review API",
      projectId: "project-review-api",
      projectSlug: "review-api",
      projectName: "Review Project",
      traceId: "trace-review-api",
      taskIds: ["task-review-api"],
      workerId: "worker-review-api",
      reviewerAgent: "review-agent",
      feedbackAgent: "feedback-agent",
      feedbackModel: "feedback-model",
      maxIterations: 3,
      cwd: "/repo",
      copyToWorktree: ["apps/web"],
    });
    const finalQa: FinalQaReport = {
      projectId: "project-review-api",
      traceId: "trace-review-api",
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
      checks: [],
      taskResults: [],
      markdown: "# Final QA Report",
    };
    const gate: FinalQaFeedbackGate = {
      projectId: "project-review-api",
      traceId: "trace-review-api",
      loopAttempted: true,
      initialFinalQa: finalQa,
      feedbackLoop: null,
      finalQa,
      readyForUserAcceptance: false,
      nextAction: "continue_automated_feedback",
      eventId: "event-review-api-final-qa-feedback-gate-completed",
    };
    const service = {
      seen: undefined as FinalQaFeedbackGateRequestDto | undefined,
      async previewWorkbench() {
        throw new Error("unexpected workbench call");
      },
      async buildFinalQaReport() {
        throw new Error("unexpected final QA call");
      },
      async buildFinalQaFeedbackGate(body: FinalQaFeedbackGateRequestDto) {
        this.seen = body;
        return gate;
      },
      async buildUatCodeReviewHandoff() {
        throw new Error("unexpected UAT handoff call");
      },
      async recordUatCodeReviewDecision() {
        throw new Error("unexpected UAT decision call");
      },
      async applyConfiguredUatCodeReviewDecision() {
        throw new Error("unexpected auto-decision call");
      },
      async runGeneratedE2eRegressionTests() {
        throw new Error("unexpected generated E2E run call");
      },
      async saveReviewWorkbenchSession() {
        throw new Error("unexpected session save call");
      },
      async loadReviewWorkbenchSession() {
        throw new Error("unexpected session load call");
      },
      async appendReviewWorkbenchAnnotation() {
        throw new Error("unexpected session annotate call");
      },
    };
    const controller = new ReviewWorkbenchController(service);

    await expect(controller.buildFinalQaFeedbackGate(input)).resolves.toBe(gate);
    expect(service.seen).toBe(input);
  });

  test("delegates UAT/code-review handoff building to the server-owned review service", async () => {
    const input = Object.assign(new UatCodeReviewHandoffRequestDto(), {
      workspaceId: "workspace-review-api",
      workspaceSlug: "review-api",
      workspaceName: "Review API",
      projectId: "project-review-api",
      projectSlug: "review-api",
      projectName: "Review Project",
      traceId: "trace-review-api",
      taskIds: ["task-review-api"],
    });
    const handoff: UatCodeReviewHandoff = {
      projectId: "project-review-api",
      traceId: "trace-review-api",
      status: "ready",
      finalQaStatus: "passed",
      nextAction: "prompt_user_for_uat_code_review",
      finalQa: {
        projectId: "project-review-api",
        traceId: "trace-review-api",
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
        markdown: "# Final QA Report",
      },
      reviewSessions: [],
      decisionOptions: [],
      promptMarkdown: "# UAT And Code Review Handoff",
      eventId: "event-review-api-uat-code-review-prompted",
    };
    const service = {
      seen: undefined as UatCodeReviewHandoffRequestDto | undefined,
      async previewWorkbench() {
        throw new Error("unexpected workbench call");
      },
      async buildFinalQaReport() {
        throw new Error("unexpected final QA call");
      },
      async buildFinalQaFeedbackGate() {
        throw new Error("unexpected final QA feedback gate call");
      },
      async buildUatCodeReviewHandoff(body: UatCodeReviewHandoffRequestDto) {
        this.seen = body;
        return handoff;
      },
      async recordUatCodeReviewDecision() {
        throw new Error("unexpected UAT decision call");
      },
      async applyConfiguredUatCodeReviewDecision() {
        throw new Error("unexpected auto-decision call");
      },
      async runGeneratedE2eRegressionTests() {
        throw new Error("unexpected generated E2E run call");
      },
      async saveReviewWorkbenchSession() {
        throw new Error("unexpected session save call");
      },
      async loadReviewWorkbenchSession() {
        throw new Error("unexpected session load call");
      },
      async appendReviewWorkbenchAnnotation() {
        throw new Error("unexpected session annotate call");
      },
    };
    const controller = new ReviewWorkbenchController(service);

    await expect(controller.buildUatCodeReviewHandoff(input)).resolves.toBe(handoff);
    expect(service.seen).toBe(input);
  });

  test("delegates UAT/code-review decision recording to the server-owned review service", async () => {
    const input = Object.assign(new UatCodeReviewDecisionRequestDto(), {
      workspaceId: "workspace-review-api",
      workspaceSlug: "review-api",
      workspaceName: "Review API",
      projectId: "project-review-api",
      projectSlug: "review-api",
      projectName: "Review Project",
      traceId: "trace-review-api",
      taskIds: ["task-review-api"],
      decision: "start_uat",
      reviewType: "uat",
    });
    const decision: UatCodeReviewDecision = {
      projectId: "project-review-api",
      traceId: "trace-review-api",
      decision: "start_uat",
      reviewType: "uat",
      status: "review_started",
      nextAction: "await_user_feedback",
      handoff: {
        projectId: "project-review-api",
        traceId: "trace-review-api",
        status: "ready",
        finalQaStatus: "passed",
        nextAction: "prompt_user_for_uat_code_review",
        finalQa: {
          projectId: "project-review-api",
          traceId: "trace-review-api",
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
          markdown: "# Final QA Report",
        },
        reviewSessions: [],
        decisionOptions: [],
        promptMarkdown: "# UAT And Code Review Handoff",
        eventId: "event-review-api-uat-code-review-prompted",
      },
      feedbackRuns: [],
      generatedE2eTests: [],
      eventId: "event-review-api-decision",
    };
    const service = {
      seen: undefined as UatCodeReviewDecisionRequestDto | undefined,
      async previewWorkbench() {
        throw new Error("unexpected workbench call");
      },
      async buildFinalQaReport() {
        throw new Error("unexpected final QA call");
      },
      async buildFinalQaFeedbackGate() {
        throw new Error("unexpected final QA feedback gate call");
      },
      async buildUatCodeReviewHandoff() {
        throw new Error("unexpected UAT handoff call");
      },
      async recordUatCodeReviewDecision(body: UatCodeReviewDecisionRequestDto) {
        this.seen = body;
        return decision;
      },
      async applyConfiguredUatCodeReviewDecision() {
        throw new Error("unexpected auto-decision call");
      },
      async runGeneratedE2eRegressionTests() {
        throw new Error("unexpected generated E2E run call");
      },
      async saveReviewWorkbenchSession() {
        throw new Error("unexpected session save call");
      },
      async loadReviewWorkbenchSession() {
        throw new Error("unexpected session load call");
      },
      async appendReviewWorkbenchAnnotation() {
        throw new Error("unexpected session annotate call");
      },
    };
    const controller = new ReviewWorkbenchController(service);

    await expect(controller.recordUatCodeReviewDecision(input)).resolves.toBe(decision);
    expect(service.seen).toBe(input);
  });

  test("delegates configured auto-decision and generated E2E runs to the server-owned review service", async () => {
    const autoInput = Object.assign(new ConfiguredUatCodeReviewDecisionRequestDto(), {
      workspaceId: "workspace-review-api",
      workspaceSlug: "review-api",
      workspaceName: "Review API",
      projectId: "project-review-api",
      projectSlug: "review-api",
      projectName: "Review Project",
      traceId: "trace-review-api",
      taskIds: ["task-review-api"],
    });
    const runInput = Object.assign(new GeneratedE2eRegressionRunRequestDto(), {
      workspaceId: "workspace-review-api",
      workspaceSlug: "review-api",
      workspaceName: "Review API",
      projectId: "project-review-api",
      projectSlug: "review-api",
      projectName: "Review Project",
      traceId: "trace-review-api",
      runner: "bun",
      planOnly: true,
    });
    const autoDecision: ConfiguredUatCodeReviewDecision = {
      projectId: "project-review-api",
      traceId: "trace-review-api",
      settingKey: "reports.uatCodeReviewAutoDecision",
      status: "applied",
      nextAction: "real_data_e2e_generated",
      config: {
        enabled: true,
        decision: "approve_without_manual_review",
        reviewType: "uat",
        e2eRunner: "bun",
      },
      decision: null,
      eventId: "event-review-api-auto-decision",
    };
    const e2eRun: GeneratedE2eRegressionRun = {
      projectId: "project-review-api",
      traceId: "trace-review-api",
      runner: "bun",
      status: "planned",
      command: ["bun", "test", "/tmp/generated.spec.ts"],
      testFiles: ["/tmp/generated.spec.ts"],
      artifactIds: ["e2e-review-api"],
      stdout: "",
      stderr: "",
      exitCode: null,
      ciCommand: ["bun", "run", "scripts/ci-generated-e2e.ts"],
      ciEnv: {
        FULCRUM_GENERATED_E2E_RUNNER: "bun",
        FULCRUM_GENERATED_E2E_FILES: "/tmp/generated.spec.ts",
      },
      eventId: "event-review-api-generated-e2e-run",
    };
    const service = {
      autoSeen: undefined as ConfiguredUatCodeReviewDecisionRequestDto | undefined,
      runSeen: undefined as GeneratedE2eRegressionRunRequestDto | undefined,
      async previewWorkbench() {
        throw new Error("unexpected workbench call");
      },
      async buildFinalQaReport() {
        throw new Error("unexpected final QA call");
      },
      async buildFinalQaFeedbackGate() {
        throw new Error("unexpected final QA feedback gate call");
      },
      async buildUatCodeReviewHandoff() {
        throw new Error("unexpected UAT handoff call");
      },
      async recordUatCodeReviewDecision() {
        throw new Error("unexpected UAT decision call");
      },
      async applyConfiguredUatCodeReviewDecision(body: ConfiguredUatCodeReviewDecisionRequestDto) {
        this.autoSeen = body;
        return autoDecision;
      },
      async runGeneratedE2eRegressionTests(body: GeneratedE2eRegressionRunRequestDto) {
        this.runSeen = body;
        return e2eRun;
      },
      async saveReviewWorkbenchSession() {
        throw new Error("unexpected session save call");
      },
      async loadReviewWorkbenchSession() {
        throw new Error("unexpected session load call");
      },
      async appendReviewWorkbenchAnnotation() {
        throw new Error("unexpected session annotate call");
      },
    };
    const controller = new ReviewWorkbenchController(service);

    await expect(controller.applyConfiguredUatCodeReviewDecision(autoInput)).resolves.toBe(autoDecision);
    await expect(controller.runGeneratedE2eRegressionTests(runInput)).resolves.toBe(e2eRun);
    expect(service.autoSeen).toBe(autoInput);
    expect(service.runSeen).toBe(runInput);
  });

  test("delegates review workbench session save and load to the server-owned review service", async () => {
    const saveInput = Object.assign(new ReviewWorkbenchSessionSaveRequestDto(), {
      workspaceId: "workspace-review-api",
      workspaceSlug: "review-api",
      workspaceName: "Review API",
      projectId: "project-review-api",
      projectSlug: "review-api",
      projectName: "Review Project",
      traceId: "trace-review-api",
      reviewId: "review-session-api",
      reviewType: "code_review",
      title: "Review Session",
      files: validWorkbenchInput().files,
      annotations: validWorkbenchInput().annotations,
      selectedFilePath: "src/app/main.ts",
      searchQuery: "trace",
    });
    const loadInput = Object.assign(new ReviewWorkbenchSessionLoadRequestDto(), {
      workspaceId: "workspace-review-api",
      workspaceSlug: "review-api",
      workspaceName: "Review API",
      projectId: "project-review-api",
      projectSlug: "review-api",
      projectName: "Review Project",
      traceId: "trace-review-api",
      reviewId: "review-session-api",
      searchQuery: "trace",
    });
    const session: ReviewWorkbenchSession = {
      projectId: "project-review-api",
      traceId: "trace-review-api",
      reviewId: "review-session-api",
      reviewType: "code_review",
      title: "Review Session",
      status: "saved",
      revision: 1,
      eventId: "review-session-api-revision-1",
      model: {
        projectId: "project-review-api",
        traceId: "trace-review-api",
        reviewId: "review-session-api",
        files: [],
        visibleFiles: [],
        selectedFile: null,
        fileTree: [],
        visualFileOrder: [],
        fileTreeStats: new Map(),
        annotationGroups: [],
        search: { query: "", matches: [], groups: [], activeMatch: null, previousMatchId: null, nextMatchId: null },
        suggestions: [],
        feedbackMarkdown: "",
        submission: { targets: [], orphans: [] },
        liveLog: { displayText: "", fullText: "", isLive: false, hasOutput: false, isWaiting: true, truncated: false },
        summary: {
          fileCount: 0,
          visibleFileCount: 0,
          viewedFileCount: 0,
          annotationCount: 0,
          blockingAnnotationCount: 0,
          suggestionCount: 0,
          searchMatchCount: 0,
          hasLiveOutput: false,
        },
      },
    };
    const service = {
      saved: undefined as ReviewWorkbenchSessionSaveRequestDto | undefined,
      loaded: undefined as ReviewWorkbenchSessionLoadRequestDto | undefined,
      async previewWorkbench() {
        throw new Error("unexpected workbench call");
      },
      async buildFinalQaReport() {
        throw new Error("unexpected final QA call");
      },
      async buildFinalQaFeedbackGate() {
        throw new Error("unexpected final QA feedback gate call");
      },
      async buildUatCodeReviewHandoff() {
        throw new Error("unexpected UAT handoff call");
      },
      async recordUatCodeReviewDecision() {
        throw new Error("unexpected UAT decision call");
      },
      async applyConfiguredUatCodeReviewDecision() {
        throw new Error("unexpected auto-decision call");
      },
      async runGeneratedE2eRegressionTests() {
        throw new Error("unexpected generated E2E run call");
      },
      async saveReviewWorkbenchSession(body: ReviewWorkbenchSessionSaveRequestDto) {
        this.saved = body;
        return session;
      },
      async loadReviewWorkbenchSession(body: ReviewWorkbenchSessionLoadRequestDto) {
        this.loaded = body;
        return { ...session, status: "loaded" as const };
      },
      async appendReviewWorkbenchAnnotation() {
        throw new Error("unexpected session annotate call");
      },
    };
    const controller = new ReviewWorkbenchController(service);

    await expect(controller.saveReviewWorkbenchSession(saveInput)).resolves.toBe(session);
    await expect(controller.loadReviewWorkbenchSession(loadInput)).resolves.toMatchObject({
      status: "loaded",
      reviewId: "review-session-api",
    });
    expect(service.saved).toBe(saveInput);
    expect(service.loaded).toBe(loadInput);
  });

  test("delegates review workbench inline annotation append to the server-owned review service", async () => {
    const annotateInput = Object.assign(new ReviewWorkbenchSessionAnnotateRequestDto(), {
      workspaceId: "workspace-review-api",
      workspaceSlug: "review-api",
      workspaceName: "Review API",
      projectId: "project-review-api",
      projectSlug: "review-api",
      projectName: "Review Project",
      traceId: "trace-review-api",
      reviewId: "review-session-api",
      annotationId: "annotation-inline-api",
      type: "suggestion",
      filePath: "src/app/main.ts",
      lineStart: 2,
      lineEnd: 2,
      side: "new",
      text: "Preserve this inline review note.",
      suggestedCode: "return traceId;",
      searchQuery: "inline",
    });
    const session: ReviewWorkbenchSession = {
      projectId: "project-review-api",
      traceId: "trace-review-api",
      reviewId: "review-session-api",
      reviewType: "code_review",
      title: "Review Session",
      status: "annotated",
      revision: 2,
      eventId: "review-session-api-revision-2",
      model: {
        projectId: "project-review-api",
        traceId: "trace-review-api",
        reviewId: "review-session-api",
        files: [],
        visibleFiles: [],
        selectedFile: null,
        fileTree: [],
        visualFileOrder: [],
        fileTreeStats: new Map(),
        annotationGroups: [],
        search: { query: "", matches: [], groups: [], activeMatch: null, previousMatchId: null, nextMatchId: null },
        suggestions: [],
        feedbackMarkdown: "",
        submission: { targets: [], orphans: [] },
        liveLog: { displayText: "", fullText: "", isLive: false, hasOutput: false, isWaiting: true, truncated: false },
        summary: {
          fileCount: 0,
          visibleFileCount: 0,
          viewedFileCount: 0,
          annotationCount: 1,
          blockingAnnotationCount: 0,
          suggestionCount: 1,
          searchMatchCount: 0,
          hasLiveOutput: false,
        },
      },
    };
    const service = {
      seen: undefined as ReviewWorkbenchSessionAnnotateRequestDto | undefined,
      async previewWorkbench() {
        throw new Error("unexpected workbench call");
      },
      async buildFinalQaReport() {
        throw new Error("unexpected final QA call");
      },
      async buildFinalQaFeedbackGate() {
        throw new Error("unexpected final QA feedback gate call");
      },
      async buildUatCodeReviewHandoff() {
        throw new Error("unexpected UAT handoff call");
      },
      async recordUatCodeReviewDecision() {
        throw new Error("unexpected UAT decision call");
      },
      async applyConfiguredUatCodeReviewDecision() {
        throw new Error("unexpected auto-decision call");
      },
      async runGeneratedE2eRegressionTests() {
        throw new Error("unexpected generated E2E run call");
      },
      async saveReviewWorkbenchSession() {
        throw new Error("unexpected session save call");
      },
      async loadReviewWorkbenchSession() {
        throw new Error("unexpected session load call");
      },
      async appendReviewWorkbenchAnnotation(body: ReviewWorkbenchSessionAnnotateRequestDto) {
        this.seen = body;
        return session;
      },
    };
    const controller = new ReviewWorkbenchController(service);

    await expect(controller.appendReviewWorkbenchAnnotation(annotateInput)).resolves.toBe(session);
    expect(service.seen).toBe(annotateInput);
  });

  test("keeps review workbench request validation at the Nest boundary", () => {
    const valid = validWorkbenchInput();
    const invalid = Object.assign(new ReviewWorkbenchRequestDto(), {
      files: undefined,
      annotations: undefined,
    });

    expect(validateSync(valid)).toEqual([]);
    expect(validateSync(invalid).map((error) => error.property).sort()).toEqual([
      "annotations",
      "files",
    ]);

    const finalQaInvalid = Object.assign(new FinalQaReportRequestDto(), {
      workspaceId: "",
      workspaceSlug: "",
      workspaceName: "",
      projectId: "",
      projectSlug: "",
      projectName: "",
    });
    expect(validateSync(finalQaInvalid).map((error) => error.property).sort()).toEqual([
      "projectId",
      "projectName",
      "projectSlug",
      "workspaceId",
      "workspaceName",
      "workspaceSlug",
    ]);

    const handoffInvalid = Object.assign(new UatCodeReviewHandoffRequestDto(), {
      workspaceId: "",
      workspaceSlug: "",
      workspaceName: "",
      projectId: "",
      projectSlug: "",
      projectName: "",
    });
    expect(validateSync(handoffInvalid).map((error) => error.property).sort()).toEqual([
      "projectId",
      "projectName",
      "projectSlug",
      "workspaceId",
      "workspaceName",
      "workspaceSlug",
    ]);

    const decisionInvalid = Object.assign(new UatCodeReviewDecisionRequestDto(), {
      workspaceId: "",
      workspaceSlug: "",
      workspaceName: "",
      projectId: "",
      projectSlug: "",
      projectName: "",
      decision: "",
      reviewType: "",
    });
    expect(validateSync(decisionInvalid).map((error) => error.property).sort()).toEqual([
      "decision",
      "projectId",
      "projectName",
      "projectSlug",
      "reviewType",
      "workspaceId",
      "workspaceName",
      "workspaceSlug",
    ]);

    const autoInvalid = Object.assign(new ConfiguredUatCodeReviewDecisionRequestDto(), {
      workspaceId: "",
      workspaceSlug: "",
      workspaceName: "",
      projectId: "",
      projectSlug: "",
      projectName: "",
    });
    expect(validateSync(autoInvalid).map((error) => error.property).sort()).toEqual([
      "projectId",
      "projectName",
      "projectSlug",
      "workspaceId",
      "workspaceName",
      "workspaceSlug",
    ]);

    const e2eRunInvalid = Object.assign(new GeneratedE2eRegressionRunRequestDto(), {
      workspaceId: "",
      workspaceSlug: "",
      workspaceName: "",
      projectId: "",
      projectSlug: "",
      projectName: "",
    });
    expect(validateSync(e2eRunInvalid).map((error) => error.property).sort()).toEqual([
      "projectId",
      "projectName",
      "projectSlug",
      "workspaceId",
      "workspaceName",
      "workspaceSlug",
    ]);

    const sessionSaveInvalid = Object.assign(new ReviewWorkbenchSessionSaveRequestDto(), {
      workspaceId: "",
      workspaceSlug: "",
      workspaceName: "",
      projectId: "",
      projectSlug: "",
      projectName: "",
      files: undefined,
      annotations: undefined,
    });
    expect(validateSync(sessionSaveInvalid).map((error) => error.property).sort()).toEqual([
      "annotations",
      "files",
      "projectId",
      "projectName",
      "projectSlug",
      "workspaceId",
      "workspaceName",
      "workspaceSlug",
    ]);

    const sessionLoadInvalid = Object.assign(new ReviewWorkbenchSessionLoadRequestDto(), {
      workspaceId: "",
      workspaceSlug: "",
      workspaceName: "",
      projectId: "",
      projectSlug: "",
      projectName: "",
    });
    expect(validateSync(sessionLoadInvalid).map((error) => error.property).sort()).toEqual([
      "projectId",
      "projectName",
      "projectSlug",
      "workspaceId",
      "workspaceName",
      "workspaceSlug",
    ]);

    const sessionAnnotateInvalid = Object.assign(new ReviewWorkbenchSessionAnnotateRequestDto(), {
      workspaceId: "",
      workspaceSlug: "",
      workspaceName: "",
      projectId: "",
      projectSlug: "",
      projectName: "",
      filePath: "",
    });
    expect(validateSync(sessionAnnotateInvalid).map((error) => error.property).sort()).toEqual([
      "filePath",
      "lineEnd",
      "lineStart",
      "projectId",
      "projectName",
      "projectSlug",
      "workspaceId",
      "workspaceName",
      "workspaceSlug",
    ]);
  });

  test("service builds the copied review workbench model", async () => {
    const service = new ReviewWorkbenchService();

    const result = await service.previewWorkbench(validWorkbenchInput());

    expect(result.projectId).toBe("project-review-api");
    expect(result.traceId).toBe("trace-review-api");
    expect(result.reviewId).toBe("review-api");
    expect(result.summary).toMatchObject({
      fileCount: 1,
      annotationCount: 1,
      suggestionCount: 1,
      searchMatchCount: 1,
      hasLiveOutput: true,
    });
    expect(result.selectedFile?.path).toBe("src/app/main.ts");
    expect(result.suggestions.map((suggestion) => suggestion.annotationId)).toEqual(["ann-api"]);
    expect(result.feedbackMarkdown).toContain("Use the trace-linked value.");
  });
});
