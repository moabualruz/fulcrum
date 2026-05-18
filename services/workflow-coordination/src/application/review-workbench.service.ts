import "reflect-metadata";

import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { DataSource, type EntityManager } from "typeorm";

import {
  buildReviewWorkbenchModel,
  type ReviewWorkbenchInput,
  type ReviewWorkbenchModel,
} from "@planning-review/application/reviews/review-workbench.ts";
import { buildManualSimulationChecklist } from "@planning-review/application/manual-simulation-checklist.ts";
import type {
  AppendReviewWorkbenchAnnotationInput,
  LoadReviewWorkbenchSessionInput,
  ReviewWorkbenchSessionOutput,
  ReviewWorkbenchSessionType,
  SaveReviewWorkbenchSessionInput,
} from "@planning-review/application/reviews/review-workbench-session-actions.ts";
import type { CodeReviewAnnotation } from "@planning-review/application/reviews/shared/review-feedback.ts";
import type {
  ApplyConfiguredUatCodeReviewDecisionInput,
  ConfiguredUatCodeReviewDecisionOutput,
  FinalQaCheck,
  FinalQaNextAction,
  FinalQaReportOutput,
  FinalQaTaskResult,
  GeneratedE2eCoverageCase,
  GeneratedE2eRegressionRunOutput,
  GeneratedE2eRegressionRunner,
  GeneratedE2eRegressionTest,
  ManualSimulationChecklist,
  RecordUatCodeReviewDecisionInput,
  RunGeneratedE2eRegressionTestsInput,
  UatCodeReviewAutoDecisionConfig,
  UatCodeReviewDecisionOption,
  UatCodeReviewDecisionOutput,
  UatCodeReviewFeedbackRun,
  UatCodeReviewHandoffOutput,
  UatCodeReviewSession,
} from "@planning-review/domain/review-acceptance.ts";
import { FulcrumRunEventEntity } from "@execution-orchestration/infrastructure/database/run-context.entities.ts";
import {
  FulcrumArtifactEntity,
  FulcrumGeneratedE2ETestEntity,
  FulcrumReviewAnnotationEntity,
  FulcrumReviewSessionEntity,
  FulcrumUatSessionEntity,
  type FulcrumGeneratedE2ETest,
  type FulcrumReviewSession,
} from "@planning-review/infrastructure/database/review-workflow.entities.ts";
import {
  FulcrumAgentRunEntity,
  FulcrumDocumentEntity,
  FulcrumProjectEntity,
  FulcrumTaskDependencyEntity,
  FulcrumTaskEntity,
  FulcrumWorkspaceEntity,
  type FulcrumAgentRun,
  type FulcrumDocument,
  type FulcrumTask,
  type FulcrumTaskDependency,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import {
  DependencyRunService,
  type AutomatedFeedbackLoopOutput,
} from "@workflow-coordination/application/dependency-execution.service.ts";

export type ReviewWorkbenchPreview = ReviewWorkbenchModel;
export type ReviewWorkbenchSession = ReviewWorkbenchSessionOutput;
export type FinalQaReport = FinalQaReportOutput;
export type FinalQaFeedbackGate = {
  projectId: string;
  traceId?: string;
  loopAttempted: boolean;
  initialFinalQa: FinalQaReportOutput;
  feedbackLoop: AutomatedFeedbackLoopOutput | null;
  finalQa: FinalQaReportOutput;
  readyForUserAcceptance: boolean;
  nextAction: FinalQaReportOutput["nextAction"];
  eventId: string;
};
export type UatCodeReviewHandoff = UatCodeReviewHandoffOutput;
export type UatCodeReviewDecision = UatCodeReviewDecisionOutput;
export type ConfiguredUatCodeReviewDecision = ConfiguredUatCodeReviewDecisionOutput;
export type GeneratedE2eRegressionRun = GeneratedE2eRegressionRunOutput;

const UAT_CODE_REVIEW_AUTO_DECISION_SETTING_KEY = "reports.uatCodeReviewAutoDecision";

export interface FinalQaReportInput {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  traceId?: string;
  taskIds?: string[];
}

export interface FinalQaFeedbackGateInput extends FinalQaReportInput {
  workerId?: string | null;
  reviewerAgent?: string | null;
  feedbackAgent?: string | null;
  feedbackModel?: string | null;
  maxIterations?: number | null;
  cwd?: string | null;
  copyToWorktree?: string[] | null;
}

export interface UatCodeReviewHandoffInput extends FinalQaReportInput {}

export interface UatCodeReviewDecisionInput
  extends UatCodeReviewHandoffInput,
    Omit<RecordUatCodeReviewDecisionInput, "projectId" | "traceId" | "taskIds"> {}

export interface ConfiguredUatCodeReviewDecisionInput
  extends UatCodeReviewHandoffInput,
    ApplyConfiguredUatCodeReviewDecisionInput {}

export interface GeneratedE2eRegressionRunInput
  extends UatCodeReviewHandoffInput,
    RunGeneratedE2eRegressionTestsInput {}

export interface ReviewWorkbenchSessionSaveInput
  extends SaveReviewWorkbenchSessionInput {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  projectSlug: string;
  projectName: string;
}

export interface ReviewWorkbenchSessionLoadInput
  extends LoadReviewWorkbenchSessionInput {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  projectSlug: string;
  projectName: string;
}

export interface ReviewWorkbenchSessionAnnotationInput
  extends AppendReviewWorkbenchAnnotationInput {
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  projectSlug: string;
  projectName: string;
}

export class ReviewWorkbenchService {
  constructor(private readonly dataSource?: DataSource) {}

  async previewWorkbench(input: ReviewWorkbenchInput): Promise<ReviewWorkbenchPreview> {
    return buildReviewWorkbenchModel(input);
  }

  async saveReviewWorkbenchSession(
    input: ReviewWorkbenchSessionSaveInput,): Promise<ReviewWorkbenchSession> {
    if (!this.dataSource) {
      throw new Error("ReviewWorkbenchService requires a TypeORM DataSource to save review sessions.");
    }
    if (!input.projectId.trim()) throw new Error("Review session projectId is required.");
    if (!input.files?.length) throw new Error("At least one review file is required.");

    const traceId = input.traceId ?? reviewWorkflowId("trace", input.projectId, "review-session");
    return await this.dataSource.transaction(async (manager) => {
      await ensureReviewWorkspaceProject(manager, input, traceId);
      const reviewType = reviewSessionType(input.reviewType);
      const reviewId = input.reviewId?.trim() || sessionId(reviewType, input.projectId, traceId);
      const existing = await manager.getRepository(FulcrumReviewSessionEntity).findOneBy({
        id: reviewId,
        projectId: input.projectId,
      });
      const revision = (existing?.revision ?? 0) + 1;
      const workbenchInput = normalizeReviewWorkbenchSessionInput({...input,
        traceId,
        reviewId,
      } as ReviewWorkbenchInput & { viewedFilePaths?: string[] });
      const model = buildReviewWorkbenchModel(workbenchInput);
      await manager.getRepository(FulcrumReviewSessionEntity).save({
        id: reviewId,
        projectId: input.projectId,
        traceId,
        reviewType,
        subjectId: reviewId,
        status: "saved",
        revision,
        summary: {
          traceId,
          reviewId,
          reviewType,
          title: input.title ?? null,
          revision,
          fileCount: workbenchInput.files.length,
          annotationCount: workbenchInput.annotations.length,
          visibleFileCount: model.summary.visibleFileCount,
          blockingAnnotationCount: model.summary.blockingAnnotationCount,
          suggestionCount: model.summary.suggestionCount,
          workbenchInput,
        },
      });
      await saveReviewAnnotations(manager, reviewId, workbenchInput.annotations);

      return {
        projectId: input.projectId,...(traceId ? { traceId } : {}),
        reviewId,
        reviewType,...(input.title ? { title: input.title } : {}),
        status: "saved",
        revision,
        eventId: reviewWorkflowId("review-session", reviewId, String(revision)),
        model,
      };
    });
  }

  async loadReviewWorkbenchSession(
    input: ReviewWorkbenchSessionLoadInput,): Promise<ReviewWorkbenchSession> {
    if (!this.dataSource) {
      throw new Error("ReviewWorkbenchService requires a TypeORM DataSource to load review sessions.");
    }
    if (!input.projectId.trim()) throw new Error("Review session projectId is required.");
    if (!input.reviewId?.trim() && !input.traceId?.trim()) {
      throw new Error("reviewId or traceId is required to load a review session.");
    }

    return await this.dataSource.transaction(async (manager) => {
      await ensureReviewWorkspaceProject(
        manager,
        input,
        input.traceId ?? reviewWorkflowId("trace", input.projectId, "review-session"),);
      const session = await findReviewSession(manager, input);
      if (!session) throw new Error("Review session not found.");
      const summary = session.summary ?? {};
      const savedInput = summary["workbenchInput"];
      if (!savedInput || typeof savedInput !== "object") {
        throw new Error("Review session payload has no workbench input.");
      }
      const workbenchInput = normalizeReviewWorkbenchSessionInput({...(savedInput as ReviewWorkbenchInput & { viewedFilePaths?: string[] }),
        projectId: input.projectId,
        traceId: session.traceId,
        reviewId: session.id,
        selectedFilePath: input.selectedFilePath ?? (savedInput as ReviewWorkbenchInput).selectedFilePath,
        viewedFilePaths: input.viewedFilePaths ?? (savedInput as ReviewWorkbenchInput & { viewedFilePaths?: string[] }).viewedFilePaths,
        hideViewedFiles: input.hideViewedFiles ?? (savedInput as ReviewWorkbenchInput).hideViewedFiles,
        searchQuery: input.searchQuery ?? (savedInput as ReviewWorkbenchInput).searchQuery,
        activeSearchMatchId: input.activeSearchMatchId ?? (savedInput as ReviewWorkbenchInput).activeSearchMatchId,
      });
      const model = buildReviewWorkbenchModel(workbenchInput);

      return {
        projectId: input.projectId,...(session.traceId ? { traceId: session.traceId } : {}),
        reviewId: session.id,
        reviewType: reviewSessionType(session.reviewType),...(typeof summary["title"] === "string" && summary["title"] ? { title: summary["title"] } : {}),
        status: "loaded",
        revision: session.revision,
        eventId: reviewWorkflowId("review-session", session.id, String(session.revision)),
        model,
      };
    });
  }

  async appendReviewWorkbenchAnnotation(
    input: ReviewWorkbenchSessionAnnotationInput,): Promise<ReviewWorkbenchSession> {
    if (!this.dataSource) {
      throw new Error("ReviewWorkbenchService requires a TypeORM DataSource to append review annotations.");
    }
    if (!input.projectId.trim()) throw new Error("Review annotation projectId is required.");
    if (!input.reviewId?.trim() && !input.traceId?.trim()) {
      throw new Error("reviewId or traceId is required to append a review annotation.");
    }
    if (!input.filePath.trim()) throw new Error("filePath is required for review annotations.");
    if (!Number.isInteger(input.lineStart) || !Number.isInteger(input.lineEnd) || input.lineStart < 1 || input.lineEnd < input.lineStart) {
      throw new Error("lineStart and lineEnd must describe a valid review annotation range.");
    }
    if (!input.text?.trim() && !input.suggestedCode?.trim()) {
      throw new Error("Review annotation requires text or suggestedCode.");
    }

    return await this.dataSource.transaction(async (manager) => {
      const session = await findReviewSession(manager, input);
      if (!session) throw new Error("Review session not found.");
      const traceId = session.traceId || input.traceId || reviewWorkflowId("trace", input.projectId, "review-session");
      await ensureReviewWorkspaceProject(manager, input, traceId);

      const summary = session.summary ?? {};
      const savedInput = summary["workbenchInput"];
      if (!savedInput || typeof savedInput !== "object" || Array.isArray(savedInput)) {
        throw new Error("Review session payload has no workbench input.");
      }
      const storedInput = savedInput as ReviewWorkbenchInput & { viewedFilePaths?: string[] };
      const files = Array.isArray(storedInput.files) ? storedInput.files : [];
      if (!files.some((file) => file.path === input.filePath)) {
        throw new Error(`Review annotation file is not in the session diff: ${input.filePath}`);
      }

      const revision = session.revision + 1;
      const annotation: CodeReviewAnnotation = {
        id: input.annotationId?.trim() || reviewWorkflowId("annotation", session.id, String(revision)),
        type: input.type ?? (input.suggestedCode ? "suggestion" : "comment"),
        scope: input.scope ?? "line",
        filePath: input.filePath,
        lineStart: input.lineStart,
        lineEnd: input.lineEnd,
        side: input.side ?? "new",...(input.text?.trim() ? { text: input.text.trim() } : {}),...(input.suggestedCode?.trim() ? { suggestedCode: input.suggestedCode } : {}),...(input.originalCode?.trim() ? { originalCode: input.originalCode } : {}),...(input.severity ? { severity: input.severity } : {}),...(input.conventionalLabel?.trim() ? { conventionalLabel: input.conventionalLabel.trim() } : {}),...(input.decorations?.length ? { decorations: input.decorations } : {}),
        author: input.author?.trim() || "review-workbench",
        source: input.source?.trim() || "review-workbench-session",
        createdAt: input.createdAt ?? Date.now(),
      };
      const workbenchInput = normalizeReviewWorkbenchSessionInput({...storedInput,
        projectId: input.projectId,
        traceId,
        reviewId: session.id,
        files,
        annotations: [...(Array.isArray(storedInput.annotations) ? storedInput.annotations : []), annotation],
        selectedFilePath: input.selectedFilePath ?? input.filePath,
        viewedFilePaths: input.viewedFilePaths ?? storedInput.viewedFilePaths,
        hideViewedFiles: input.hideViewedFiles ?? storedInput.hideViewedFiles,
        searchQuery: input.searchQuery ?? storedInput.searchQuery,
        activeSearchMatchId: input.activeSearchMatchId ?? storedInput.activeSearchMatchId,
      });
      const model = buildReviewWorkbenchModel(workbenchInput);
      const reviewType = reviewSessionType(session.reviewType);
      const title = typeof summary["title"] === "string" && summary["title"] ? summary["title"] : undefined;

      await manager.getRepository(FulcrumReviewSessionEntity).save({
        id: session.id,
        projectId: input.projectId,
        traceId,
        reviewType,
        subjectId: session.subjectId || session.id,
        status: "annotated",
        revision,
        summary: {
          traceId,
          reviewId: session.id,
          reviewType,
          title: title ?? null,
          revision,
          fileCount: workbenchInput.files.length,
          annotationCount: workbenchInput.annotations.length,
          visibleFileCount: model.summary.visibleFileCount,
          blockingAnnotationCount: model.summary.blockingAnnotationCount,
          suggestionCount: model.summary.suggestionCount,
          addedAnnotationId: annotation.id,
          workbenchInput,
        },
      });
      await saveReviewAnnotations(manager, session.id, workbenchInput.annotations);

      return {
        projectId: input.projectId,...(traceId ? { traceId } : {}),
        reviewId: session.id,
        reviewType,...(title ? { title } : {}),
        status: "annotated",
        revision,
        eventId: reviewWorkflowId("review-session", session.id, String(revision)),
        model,
      };
    });
  }

  async buildFinalQaReport(input: FinalQaReportInput): Promise<FinalQaReport> {
    if (!this.dataSource) {
      throw new Error("ReviewWorkbenchService requires a TypeORM DataSource to build final QA reports.");
    }
    if (!input.projectId.trim()) throw new Error("Final QA projectId is required.");

    const traceId = input.traceId ?? reviewWorkflowId("trace", input.projectId, "final-qa");
    return await this.dataSource.transaction(async (manager) => {
      await ensureReviewWorkspaceProject(manager, input, traceId);
      const report = await buildPersistedFinalQaReport(manager, input, traceId);
      const firstRunId = report.taskResults.flatMap((task) => task.runIds)[0];

      if (firstRunId) {
        await manager.getRepository(FulcrumRunEventEntity).save({
          id: reviewWorkflowId("event", traceId, "final-qa-completed"),
          projectId: input.projectId,
          runId: firstRunId,
          taskId: null,
          traceId,
          sequence: await nextRunEventSequence(manager, firstRunId),
          domain: "review",
          mutationType: "final_qa_completed",
          targetKind: "project",
          targetId: input.projectId,
          agentId: "final-qa",
          taskLineageId: traceId,
          payload: {
            traceId,
            status: report.status,
            nextAction: report.nextAction,
            readyForUserAcceptance: report.readyForUserAcceptance,
            summary: report.summary,
            checks: report.checks.map((check) => ({
              id: check.id,
              status: check.status,
              details: check.details,
            })),
            taskIds: report.taskResults.map((task) => task.taskId),
          },
        });
      }

      return report;
    });
  }

  async buildFinalQaFeedbackGate(
    input: FinalQaFeedbackGateInput,): Promise<FinalQaFeedbackGate> {
    if (!this.dataSource) {
      throw new Error("ReviewWorkbenchService requires a TypeORM DataSource to build final QA feedback gates.");
    }
    if (!input.projectId.trim()) throw new Error("Final QA feedback gate projectId is required.");

    const traceId = input.traceId ?? reviewWorkflowId("trace", input.projectId, "final-qa-feedback-gate");
    const scopedInput: FinalQaReportInput = {
      workspaceId: input.workspaceId,
      workspaceSlug: input.workspaceSlug,
      workspaceName: input.workspaceName,
      projectId: input.projectId,
      projectSlug: input.projectSlug,
      projectName: input.projectName,
      traceId,
      taskIds: input.taskIds,
    };
    const initialFinalQa = await this.buildFinalQaReport(scopedInput);
    const feedbackLoop = initialFinalQa.nextAction === "continue_automated_feedback"
      ? await new DependencyRunService(this.dataSource).runAutomatedFeedbackLoop({
        workspaceId: input.workspaceId,
        workspaceSlug: input.workspaceSlug,
        workspaceName: input.workspaceName,
        projectId: input.projectId,
        projectSlug: input.projectSlug,
        projectName: input.projectName,
        traceId,
        reviewType: "code",
        workerId: input.workerId ?? null,
        reviewerAgent: input.reviewerAgent ?? null,
        feedbackAgent: input.feedbackAgent ?? null,
        feedbackModel: input.feedbackModel ?? null,
        maxIterations: input.maxIterations ?? null,
        cwd: input.cwd ?? null,
        copyToWorktree: input.copyToWorktree ?? null,
      })
      : null;
    const finalQa = feedbackLoop ? await this.buildFinalQaReport(scopedInput) : initialFinalQa;
    const firstRunId = finalQa.taskResults.flatMap((task) => task.runIds)[0] ??
      initialFinalQa.taskResults.flatMap((task) => task.runIds)[0];
    const eventId = firstRunId
      ? await this.dataSource.transaction(async (manager) => {
        const id = reviewWorkflowId("event", traceId, "final-qa-feedback-gate-completed");
        await manager.getRepository(FulcrumRunEventEntity).save({
          id,
          projectId: input.projectId,
          runId: firstRunId,
          taskId: null,
          traceId,
          sequence: await nextRunEventSequence(manager, firstRunId),
          domain: "review",
          mutationType: "final_qa_feedback_gate_completed",
          targetKind: "project",
          targetId: input.projectId,
          agentId: "final-qa",
          taskLineageId: traceId,
          payload: {
            traceId,
            loopAttempted: Boolean(feedbackLoop),
            loopStopReason: feedbackLoop?.stopReason ?? null,
            initialStatus: initialFinalQa.status,
            initialNextAction: initialFinalQa.nextAction,
            finalStatus: finalQa.status,
            finalNextAction: finalQa.nextAction,
            readyForUserAcceptance: finalQa.readyForUserAcceptance,
            openFeedbackRunCount: finalQa.summary.openFeedbackRunCount,
          },
        });
        return id;
      })
      : "";

    return {
      projectId: input.projectId,...(traceId ? { traceId } : {}),
      loopAttempted: Boolean(feedbackLoop),
      initialFinalQa,
      feedbackLoop,
      finalQa,
      readyForUserAcceptance: finalQa.readyForUserAcceptance,
      nextAction: finalQa.nextAction,
      eventId,
    };
  }

  async buildUatCodeReviewHandoff(
    input: UatCodeReviewHandoffInput,): Promise<UatCodeReviewHandoff> {
    if (!this.dataSource) {
      throw new Error("ReviewWorkbenchService requires a TypeORM DataSource to build UAT/code-review handoffs.");
    }
    if (!input.projectId.trim()) throw new Error("UAT/code-review handoff projectId is required.");

    const traceId = input.traceId ?? reviewWorkflowId("trace", input.projectId, "uat-handoff");
    return await this.dataSource.transaction(async (manager) => {
      await ensureReviewWorkspaceProject(manager, input, traceId);
      const finalQa = await buildPersistedFinalQaReport(manager, input, traceId);
      const ready = finalQa.status === "passed" && finalQa.readyForUserAcceptance;
      const reviewSessions = ready ? reviewSessionsFor(finalQa, traceId) : [];
      const nextAction = ready ? "prompt_user_for_uat_code_review" : finalQa.nextAction;
      const promptMarkdown = ready ? readyPrompt(finalQa, reviewSessions) : blockedPrompt(finalQa);
      const eventId = reviewWorkflowId(
        "event",
        traceId,
        ready ? "uat-code-review-prompted" : "uat-code-review-blocked",);

      if (ready) {
        await manager.getRepository(FulcrumUatSessionEntity).save({
          id: reviewSessions[0]?.id ?? sessionId("uat", finalQa.projectId, traceId),
          projectId: input.projectId,
          traceId,
          status: "pending_user_decision",
          finalQaEventId: null,
          approvedAt: null,
        });
        await manager.getRepository(FulcrumReviewSessionEntity).save({
          id: reviewSessions[1]?.id ?? sessionId("code-review", finalQa.projectId, traceId),
          projectId: input.projectId,
          traceId,
          reviewType: "code_review",
          subjectId: input.projectId,
          status: "pending_user_decision",
          revision: 1,
          summary: {
            finalQaStatus: finalQa.status,
            taskIds: finalQa.taskResults.map((task) => task.taskId),
            successCriteriaCount: finalQa.summary.successCriteriaCount,
          },
        });
      }

      const firstRunId = finalQa.taskResults.flatMap((task) => task.runIds)[0];
      if (firstRunId) {
        await manager.getRepository(FulcrumRunEventEntity).save({
          id: eventId,
          projectId: input.projectId,
          runId: firstRunId,
          taskId: null,
          traceId,
          sequence: await nextRunEventSequence(manager, firstRunId),
          domain: "review",
          mutationType: ready ? "uat_code_review_prompted" : "uat_code_review_blocked",
          targetKind: "project",
          targetId: input.projectId,
          agentId: "uat-code-review",
          taskLineageId: traceId,
          payload: {
            traceId,
            status: ready ? "ready" : "blocked",
            finalQaStatus: finalQa.status,
            nextAction,
            reviewSessionIds: reviewSessions.map((session) => session.id),
            taskIds: finalQa.taskResults.map((task) => task.taskId),
            summary: finalQa.summary,
          },
        });
      }

      return {
        projectId: input.projectId,...(input.traceId ? { traceId } : {}),
        status: ready ? "ready" : "blocked",
        finalQaStatus: finalQa.status,
        nextAction,
        finalQa,
        reviewSessions,
        decisionOptions: ready ? readyDecisionOptions() : blockedDecisionOptions(finalQa),
        promptMarkdown,
        eventId: firstRunId ? eventId : "",
      };
    });
  }

  async recordUatCodeReviewDecision(
    input: UatCodeReviewDecisionInput,): Promise<UatCodeReviewDecision> {
    if (!this.dataSource) {
      throw new Error("ReviewWorkbenchService requires a TypeORM DataSource to record UAT/code-review decisions.");
    }
    if (!input.projectId.trim()) throw new Error("UAT/code-review decision projectId is required.");
    if (!input.decision?.trim()) throw new Error("UAT/code-review decision is required.");
    if (!input.reviewType?.trim()) throw new Error("UAT/code-review reviewType is required.");

    const traceId = input.traceId ?? reviewWorkflowId("trace", input.projectId, "uat-decision");
    const handoff = await this.buildUatCodeReviewHandoff({...input, traceId });
    return await this.dataSource.transaction(async (manager) => {
      const firstRunId = handoff.finalQa.taskResults.flatMap((task) => task.runIds)[0];
      const eventId = reviewWorkflowId("event", traceId, "uat-code-review-decision-recorded", input.decision);
      let status: UatCodeReviewDecisionOutput["status"] = "review_started";
      let nextAction: UatCodeReviewDecisionOutput["nextAction"] = "await_user_feedback";
      let feedbackRuns: UatCodeReviewFeedbackRun[] = [];
      let generatedE2eTests: GeneratedE2eRegressionTest[] = [];

      if (handoff.status !== "ready") {
        status = "blocked";
        nextAction = "manual_review_required";
      } else if (input.decision === "request_changes") {
        if (!input.feedbackText?.trim()) {
          throw new Error("Requested UAT/code-review changes require feedback text.");
        }
        feedbackRuns = await scheduleTypeOrmUatFeedbackRuns(manager, input, traceId, handoff.finalQa.taskResults);
        status = "changes_requested";
        nextAction = "feedback_run_scheduled";
      } else if (input.decision === "approve_without_manual_review") {
        generatedE2eTests = await generateTypeOrmE2eRegressionTests(manager, input, traceId, handoff.finalQa.taskResults);
        await manager.getRepository(FulcrumUatSessionEntity).save({
          id: sessionId("uat", input.projectId, traceId),
          projectId: input.projectId,
          traceId,
          status: "approved",
          finalQaEventId: null,
          approvedAt: new Date(),
        });
        status = "approved";
        nextAction = "real_data_e2e_generated";
      } else {
        await markTypeOrmReviewStarted(manager, input, traceId);
      }

      if (firstRunId) {
        await manager.getRepository(FulcrumRunEventEntity).save({
          id: eventId,
          projectId: input.projectId,
          runId: firstRunId,
          taskId: null,
          traceId,
          sequence: await nextRunEventSequence(manager, firstRunId),
          domain: "review",
          mutationType: "uat_code_review_decision_recorded",
          targetKind: "project",
          targetId: input.projectId,
          agentId: "uat-code-review",
          taskLineageId: traceId,
          payload: {
            traceId,
            decision: input.decision,
            reviewType: input.reviewType,
            status,
            nextAction,
            feedbackRunIds: feedbackRuns.map((run) => run.id),
            generatedE2eArtifactIds: generatedE2eTests.map((test) => test.artifactId),
            feedbackText: input.feedbackText ?? null,
          },
        });
      }

      return {
        projectId: input.projectId,...(input.traceId ? { traceId } : {}),
        decision: input.decision,
        reviewType: input.reviewType,
        status,
        nextAction,
        handoff,
        feedbackRuns,
        generatedE2eTests,
        eventId: firstRunId ? eventId : "",
      };
    });
  }

  async applyConfiguredUatCodeReviewDecision(
    input: ConfiguredUatCodeReviewDecisionInput,): Promise<ConfiguredUatCodeReviewDecision> {
    if (!this.dataSource) {
      throw new Error("ReviewWorkbenchService requires a TypeORM DataSource to apply configured UAT/code-review decisions.");
    }
    if (!input.projectId.trim()) throw new Error("Configured UAT/code-review projectId is required.");

    const traceId = input.traceId ?? reviewWorkflowId("trace", input.projectId, "uat-auto-decision");
    const config = await this.dataSource.transaction(async (manager) => {
      await ensureReviewWorkspaceProject(manager, input, traceId);
      return await loadTypeOrmAutoDecisionConfig(manager, input.workspaceId);
    });
    if (!config) {
      return configuredDecisionOutput(input, traceId, {
        status: "not_configured",
        nextAction: "configure_auto_decision",
        config: null,
        decision: null,
        eventId: "",
      });
    }
    if (!config.enabled) {
      return configuredDecisionOutput(input, traceId, {
        status: "disabled",
        nextAction: "manual_review_required",
        config,
        decision: null,
        eventId: "",
      });
    }

    const decision = await this.recordUatCodeReviewDecision({...input,
      traceId,
      taskIds: input.taskIds ?? config.taskIds,
      decision: config.decision,
      reviewType: config.reviewType,
      feedbackText: config.feedbackText,
      feedbackAgent: config.feedbackAgent,
      feedbackModel: config.feedbackModel,
      e2eRunner: config.e2eRunner,
    });
    const status: ConfiguredUatCodeReviewDecisionOutput["status"] = decision.status === "blocked"
      ? "blocked"
      : "applied";
    const firstRunId = decision.handoff.finalQa.taskResults.flatMap((task) => task.runIds)[0];
    const eventId = firstRunId
      ? await this.dataSource.transaction(async (manager) => {
        const id = reviewWorkflowId("event", traceId, "uat-code-review-auto-decision-applied");
        await manager.getRepository(FulcrumRunEventEntity).save({
          id,
          projectId: input.projectId,
          runId: firstRunId,
          taskId: null,
          traceId,
          sequence: await nextRunEventSequence(manager, firstRunId),
          domain: "review",
          mutationType: "uat_code_review_auto_decision_applied",
          targetKind: "project",
          targetId: input.projectId,
          agentId: "uat-code-review",
          taskLineageId: traceId,
          payload: {
            traceId,
            settingKey: UAT_CODE_REVIEW_AUTO_DECISION_SETTING_KEY,
            decision: config.decision,
            reviewType: config.reviewType,
            status,
            nextAction: decision.nextAction,
            decisionEventId: decision.eventId,
            generatedE2eArtifactIds: decision.generatedE2eTests.map((test) => test.artifactId),
            feedbackRunIds: decision.feedbackRuns.map((run) => run.id),
          },
        });
        return id;
      })
      : "";

    return configuredDecisionOutput(input, traceId, {
      status,
      nextAction: decision.nextAction,
      config,
      decision,
      eventId,
    });
  }

  async runGeneratedE2eRegressionTests(
    input: GeneratedE2eRegressionRunInput,): Promise<GeneratedE2eRegressionRun> {
    if (!this.dataSource) {
      throw new Error("ReviewWorkbenchService requires a TypeORM DataSource to run generated E2E tests.");
    }
    if (!input.projectId.trim()) throw new Error("Generated E2E projectId is required.");

    const traceId = input.traceId ?? reviewWorkflowId("trace", input.projectId, "generated-e2e");
    const runner = input.runner ?? "bun";
    return await this.dataSource.transaction(async (manager) => {
      await ensureReviewWorkspaceProject(manager, input, traceId);
      const rows = await loadTypeOrmGeneratedE2eTests(manager, input.projectId, traceId, runner, !!input.traceId);
      if (rows.length === 0) {
        throw new Error("No accepted generated UAT E2E regression tests were found.");
      }
      const testFiles = await materializeTypeOrmGeneratedE2eTests(input.projectId, traceId, rows);
      const plan = buildTypeOrmGeneratedE2eRunnerPlan(runner, testFiles);
      let stdout = "";
      let stderr = "";
      let exitCode: number | null = null;
      let status: GeneratedE2eRegressionRunOutput["status"] = "planned";
      if (!input.planOnly) {
        const proc = Bun.spawn(plan.command, { stdout: "pipe", stderr: "pipe", cwd: plan.cwd });
        [stdout, stderr, exitCode] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]);
        status = exitCode === 0 ? "passed" : "failed";
      }

      const runId = reviewWorkflowId("run", traceId, "generated-e2e", runner);
      await manager.getRepository(FulcrumAgentRunEntity).save({
        id: runId,
        projectId: input.projectId,
        taskId: null,
        traceId,
        status,
        dependencyTree: rows.map((row) => row.id),
      });
      const eventId = reviewWorkflowId("event", traceId, "generated-e2e-regression-run-completed", runner);
      await manager.getRepository(FulcrumRunEventEntity).save({
        id: eventId,
        projectId: input.projectId,
        runId,
        taskId: null,
        traceId,
        sequence: await nextRunEventSequence(manager, runId),
        domain: "review",
        mutationType: "generated_e2e_regression_run_completed",
        targetKind: "project",
        targetId: input.projectId,
        agentId: "generated-e2e",
        taskLineageId: traceId,
        payload: {
          traceId,
          runner,
          status,
          command: plan.command,
          cwd: plan.cwd ?? null,
          testFiles,
          artifactIds: rows.map((row) => row.id),
          exitCode,
          ciCommand: plan.ciCommand,
          ciEnv: plan.ciEnv,
        },
      });

      return {
        projectId: input.projectId,...(input.traceId ? { traceId } : {}),
        runner,
        status,
        command: plan.command,...(plan.cwd ? { cwd: plan.cwd } : {}),
        testFiles,
        artifactIds: rows.map((row) => row.id),
        stdout,
        stderr,
        exitCode,
        ciCommand: plan.ciCommand,
        ciEnv: plan.ciEnv,
        eventId,
      };
    });
  }
}

Injectable()(ReviewWorkbenchService);
Inject(DataSource)(ReviewWorkbenchService, undefined, 0);

function configuredDecisionOutput(
  input: ConfiguredUatCodeReviewDecisionInput,
  traceId: string,
  parts: {
    status: ConfiguredUatCodeReviewDecisionOutput["status"];
    nextAction: ConfiguredUatCodeReviewDecisionOutput["nextAction"];
    config: UatCodeReviewAutoDecisionConfig | null;
    decision: UatCodeReviewDecisionOutput | null;
    eventId: string;
  },): ConfiguredUatCodeReviewDecisionOutput {
  return {
    projectId: input.projectId,...(traceId ? { traceId } : {}),
    settingKey: UAT_CODE_REVIEW_AUTO_DECISION_SETTING_KEY,
    status: parts.status,
    nextAction: parts.nextAction,
    config: parts.config,
    decision: parts.decision,
    eventId: parts.eventId,
  };
}

async function loadTypeOrmAutoDecisionConfig(
  manager: EntityManager,
  workspaceId: string,): Promise<UatCodeReviewAutoDecisionConfig | null> {
  const tableRows = await manager.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'tenant_settings'
      LIMIT 1`,) as Array<{ table_name: string }>;
  if (tableRows.length === 0) return null;

  const rows = await manager.query(
    `SELECT value
       FROM tenant_settings
      WHERE org_id = $1
        AND key = $2
      LIMIT 1`,
    [workspaceId, UAT_CODE_REVIEW_AUTO_DECISION_SETTING_KEY],) as Array<{ value: unknown }>;
  if (!rows[0]) return null;
  const value = typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
  return parseTypeOrmAutoDecisionConfig(value);
}

function parseTypeOrmAutoDecisionConfig(value: unknown): UatCodeReviewAutoDecisionConfig {
  if (!isRecord(value)) throw new Error("UAT/code-review auto-decision setting must be a JSON object.");
  return {
    enabled: value["enabled"] === true,
    decision: parseTypeOrmDecision(value["decision"]),
    reviewType: parseTypeOrmReviewType(value["reviewType"]),...(optionalStringConfigValue(value["feedbackText"]) ? { feedbackText: optionalStringConfigValue(value["feedbackText"]) } : {}),...(nullableStringConfigValue(value["feedbackAgent"]) !== undefined ? { feedbackAgent: nullableStringConfigValue(value["feedbackAgent"]) } : {}),...(nullableStringConfigValue(value["feedbackModel"]) !== undefined ? { feedbackModel: nullableStringConfigValue(value["feedbackModel"]) } : {}),...(stringArrayConfigValue(value["taskIds"]) ? { taskIds: stringArrayConfigValue(value["taskIds"]) } : {}),...(parseOptionalTypeOrmRunner(value["e2eRunner"]) ? { e2eRunner: parseOptionalTypeOrmRunner(value["e2eRunner"]) } : {}),
  };
}

function parseTypeOrmDecision(value: unknown): UatCodeReviewAutoDecisionConfig["decision"] {
  if (
    value === "start_uat" ||
    value === "start_code_review" ||
    value === "request_changes" ||
    value === "approve_without_manual_review") return value;
  throw new Error("UAT/code-review auto-decision setting requires a valid decision.");
}

function parseTypeOrmReviewType(value: unknown): "uat" | "code_review" {
  if (value === "uat" || value === "code_review") return value;
  throw new Error("UAT/code-review auto-decision setting requires reviewType uat or code_review.");
}

function parseOptionalTypeOrmRunner(value: unknown): GeneratedE2eRegressionRunner | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "bun" || value === "playwright") return value;
  throw new Error("UAT/code-review auto-decision e2eRunner must be bun or playwright.");
}

function optionalStringConfigValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nullableStringConfigValue(value: unknown): string | null | undefined {
  if (value === null) return null;
  return optionalStringConfigValue(value);
}

function stringArrayConfigValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  return values.length ? values : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function loadTypeOrmGeneratedE2eTests(
  manager: EntityManager,
  projectId: string,
  traceId: string,
  runner: GeneratedE2eRegressionRunner,
  filterByTrace: boolean,): Promise<FulcrumGeneratedE2ETest[]> {
  return await manager.getRepository(FulcrumGeneratedE2ETestEntity).find({
    where: {
      projectId,
      runner,
      status: "accepted",...(filterByTrace ? { traceId } : {}),
    },
    order: { createdAt: "ASC", id: "ASC" },
  });
}

async function materializeTypeOrmGeneratedE2eTests(
  projectId: string,
  traceId: string,
  rows: FulcrumGeneratedE2ETest[],): Promise<string[]> {
  const directory = join(tmpdir(), "fulcrum-generated-e2e", slug(projectId), slug(traceId));
  await mkdir(directory, { recursive: true });
  const testFiles: string[] = [];
  for (const row of rows) {
    const filePath = join(directory, safeGeneratedE2eFilename(row.filePath || `${row.id}.spec.ts`));
    await writeFile(filePath, row.bodyMd, "utf8");
    testFiles.push(filePath);
  }
  return testFiles;
}

function safeGeneratedE2eFilename(value: string): string {
  const safe = basename(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!safe) return "generated.spec.ts";
  return safe.endsWith(".ts") ? safe : `${safe}.ts`;
}

function buildTypeOrmGeneratedE2eRunnerPlan(
  runner: GeneratedE2eRegressionRunner,
  testFiles: string[],): {
  command: string[];
  cwd?: string;
  ciCommand: string[];
  ciEnv: Record<string, string>;
} {
  const ciCommand = ["bun", "run", "scripts/ci-generated-e2e.ts"];
  const ciEnv = {
    FULCRUM_GENERATED_E2E_RUNNER: runner,
    FULCRUM_GENERATED_E2E_FILES: testFiles.join(":"),
  };
  if (runner === "playwright") {
    return {
      command: ["bun", "run", "web:e2e:generated", "--",...testFiles],
      cwd: "apps/web",
      ciCommand,
      ciEnv,
    };
  }
  return {
    command: ["bun", "test",...testFiles],
    ciCommand,
    ciEnv,
  };
}

async function ensureReviewWorkspaceProject(
  manager: EntityManager,
  input: {
    workspaceId: string;
    workspaceSlug: string;
    workspaceName: string;
    projectId: string;
    projectSlug: string;
    projectName: string;
  },
  traceId: string,): Promise<void> {
  await manager.getRepository(FulcrumWorkspaceEntity).save({
    id: input.workspaceId,
    slug: input.workspaceSlug,
    name: input.workspaceName,
  });
  await manager.getRepository(FulcrumProjectEntity).save({
    id: input.projectId,
    workspaceId: input.workspaceId,
    slug: input.projectSlug,
    name: input.projectName,
    traceId,
  });
}

function normalizeReviewWorkbenchSessionInput(
  input: ReviewWorkbenchInput & { viewedFilePaths?: string[] },): ReviewWorkbenchInput & { viewedFilePaths?: string[] } {
  return {
    projectId: input.projectId,
    traceId: input.traceId,
    reviewId: input.reviewId,
    files: input.files,
    annotations: input.annotations,
    selectedFilePath: input.selectedFilePath,
    viewedFilePaths: Array.from(input.viewedFilePaths ?? []),
    hideViewedFiles: input.hideViewedFiles,
    searchQuery: input.searchQuery,
    activeSearchMatchId: input.activeSearchMatchId,
    liveLog: input.liveLog,
    editorAnnotations: input.editorAnnotations,
    currentPrUrl: input.currentPrUrl,
    currentPrMeta: input.currentPrMeta,
  };
}

async function saveReviewAnnotations(
  manager: EntityManager,
  reviewSessionId: string,
  annotations: ReviewWorkbenchInput["annotations"],): Promise<void> {
  for (const [index, annotation] of annotations.entries()) {
    const source = annotation as unknown as Record<string, unknown>;
    const id = typeof source["id"] === "string"
      ? source["id"]
      : reviewWorkflowId("annotation", reviewSessionId, String(index + 1));
    await manager.getRepository(FulcrumReviewAnnotationEntity).save({
      id,
      reviewSessionId,
      filePath: stringValue(source["filePath"]) || stringValue(source["path"]) || "unknown",
      lineStart: numberValue(source["lineStart"], 1),
      lineEnd: numberValue(source["lineEnd"], numberValue(source["lineStart"], 1)),
      severity: stringValue(source["severity"]) || stringValue(source["type"]) || "comment",
      body: stringValue(source["text"]) || stringValue(source["body"]) || "",
      status: stringValue(source["status"]) || "open",
    });
  }
}

async function findReviewSession(
  manager: EntityManager,
  input: ReviewWorkbenchSessionLoadInput,): Promise<FulcrumReviewSession | null> {
  if (input.reviewId?.trim()) {
    return await manager.getRepository(FulcrumReviewSessionEntity).findOneBy({
      id: input.reviewId,
      projectId: input.projectId,
    });
  }
  return await manager.getRepository(FulcrumReviewSessionEntity).findOne({
    where: {
      projectId: input.projectId,
      traceId: input.traceId,
    },
    order: { revision: "DESC" },
  });
}

function reviewSessionType(value: unknown): ReviewWorkbenchSessionType {
  return value === "plan" || value === "uat" || value === "code_review" ? value : "code_review";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

async function buildPersistedFinalQaReport(
  manager: EntityManager,
  input: FinalQaReportInput,
  traceId: string,): Promise<FinalQaReportOutput> {
  const selectedTaskIds = new Set(input.taskIds ?? []);
  const allTasks = await manager.getRepository(FulcrumTaskEntity).find({
    where: { projectId: input.projectId },
    order: { id: "ASC" },
  });
  const tasks = selectedTaskIds.size > 0
    ? allTasks.filter((task) => selectedTaskIds.has(task.id))
    : allTasks;
  const taskById = new Map(allTasks.map((task) => [task.id, task]));
  const docs = await manager.getRepository(FulcrumDocumentEntity).find({
    where: { projectId: input.projectId },
  });
  const dependencies = await manager.getRepository(FulcrumTaskDependencyEntity).find({
    where: { projectId: input.projectId },
  });
  const runs = await manager.getRepository(FulcrumAgentRunEntity).find({
    where: { projectId: input.projectId },
    order: { id: "ASC" },
  });
  const artifacts = await manager.getRepository(FulcrumArtifactEntity).find({
    where: { projectId: input.projectId },
    order: { id: "ASC" },
  });
  const qaEvents = await manager.getRepository(FulcrumRunEventEntity).find({
    where: { projectId: input.projectId, mutationType: "qa_review_recorded" },
    order: { createdAt: "ASC", id: "ASC" },
  });

  const dependenciesByTask = groupValues(
    dependencies,
    (dependency) => dependency.taskId,
    (dependency) => dependency,);
  const runsByTask = groupValues(runs, (run) => run.taskId, (run) => run);
  const latestReviewByTask = latestReviewEvents(qaEvents);
  const artifactIds = artifacts.filter((artifact) => artifact.traceId === traceId || !input.traceId).map((artifact) => artifact.id);
  const taskResults = tasks.map((task) =>
    buildTypeOrmTaskResult({
      task,
      taskById,
      dependencies: dependenciesByTask.get(task.id) ?? [],
      latestReview: latestReviewByTask.get(task.id) ?? null,
      runs: runsByTask.get(task.id) ?? [],
      artifactIds,
    }));
  const scopedTaskIds = new Set(taskResults.map((task) => task.taskId));
  const scopedRuns = runs.filter((run) => run.taskId && scopedTaskIds.has(run.taskId));
  const summary = {
    taskCount: tasks.length,
    docCount: docs.length,
    runCount: scopedRuns.length,
    artifactCount: artifactIds.length,
    successCriteriaCount: taskResults.reduce((sum, task) => sum + task.successCriteria.length, 0),
    approvedTaskCount: taskResults.filter((task) => task.latestVerdict === "APPROVE").length,
    blockedTaskCount: taskResults.filter((task) =>
      task.status === "blocked" || task.unresolvedDependencyIds.length > 0).length,
    openFeedbackRunCount: taskResults.reduce((sum, task) => sum + task.openFeedbackRunIds.length, 0),
  };
  const checks = finalQaChecks({ docs, taskResults, runs: scopedRuns, summary });
  const failed = checks.some((check) => check.status === "fail");
  const nextAction = finalQaNextAction(failed, taskResults, summary.openFeedbackRunCount);

  return {
    projectId: input.projectId,...(input.traceId ? { traceId } : {}),
    status: failed ? "failed" : "passed",
    readyForUserAcceptance: !failed,
    nextAction,
    summary,
    checks,
    taskResults,
    markdown: renderFinalQaMarkdown({
      projectId: input.projectId,
      traceId: input.traceId,
      status: failed ? "failed" : "passed",
      nextAction,
      summary,
      checks,
      taskResults,
    }),
  };
}

function buildTypeOrmTaskResult(input: {
  task: FulcrumTask;
  taskById: Map<string, FulcrumTask>;
  dependencies: FulcrumTaskDependency[];
  latestReview: { id: string; payload: Record<string, unknown> } | null;
  runs: FulcrumAgentRun[];
  artifactIds: string[];
}): FinalQaTaskResult {
  return {
    taskId: input.task.id,
    title: input.task.title,
    status: input.task.status,
    successCriteria: Array.isArray(input.task.successCriteria) ? input.task.successCriteria : [],
    latestVerdict: verdictFromPayload(input.latestReview?.payload),
    latestReviewEventId: input.latestReview?.id ?? null,
    unresolvedDependencyIds: input.dependencies.map((dependency) => dependency.dependsOnTaskId).filter((dependencyId) => {
        const dependency = input.taskById.get(dependencyId);
        return !dependency || !isSatisfiedTaskStatus(dependency.status);
      }),
    runIds: input.runs.map((run) => run.id),
    openFeedbackRunIds: input.runs.filter((run) => isOpenRunStatus(run.status)).map((run) => run.id),
    artifactIds: input.artifactIds,
  };
}

function finalQaChecks(input: {
  docs: FulcrumDocument[];
  taskResults: FinalQaTaskResult[];
  runs: FulcrumAgentRun[];
  summary: FinalQaReportOutput["summary"];
}): FinalQaCheck[] {
  const criteriaTasks = input.taskResults.filter((task) => task.successCriteria.length > 0);
  const unapproved = criteriaTasks.filter((task) => task.latestVerdict !== "APPROVE");
  const unresolved = input.taskResults.filter((task) => task.unresolvedDependencyIds.length > 0);
  const badRuns = input.runs.filter((run) => !isSucceededRunStatus(run.status));

  return [
    {
      id: "docs-present",
      label: "Project docs present",
      status: input.docs.length > 0 ? "pass" : "fail",
      details: input.docs.length > 0
        ? `${input.docs.length} project doc(s) linked`
        : "No project docs were found for final QA.",
      subjectKind: "project",
    },
    {
      id: "success-criteria-approved",
      label: "Success criteria approved",
      status: criteriaTasks.length > 0 && unapproved.length === 0 ? "pass" : "fail",
      details: criteriaTasks.length === 0
        ? "No task success criteria were found."
        : unapproved.length === 0
        ? `${criteriaTasks.length} task(s) have APPROVE verdicts.`
        : `${unapproved.length} task(s) are not approved: ${unapproved.map((task) => `${task.taskId}:${task.latestVerdict ?? "missing"}`).join(", ")}`,
      subjectKind: "task",
    },
    {
      id: "dependencies-resolved",
      label: "Dependencies resolved",
      status: unresolved.length === 0 ? "pass" : "fail",
      details: unresolved.length === 0
        ? "No unresolved dependencies remain."
        : `${unresolved.length} task(s) have unresolved dependencies.`,
      subjectKind: "task",
    },
    {
      id: "automated-feedback-closed",
      label: "Automated feedback closed",
      status: input.summary.openFeedbackRunCount === 0 ? "pass" : "fail",
      details: input.summary.openFeedbackRunCount === 0
        ? "No queued or running feedback runs remain."
        : `${input.summary.openFeedbackRunCount} open feedback run(s) remain.`,
      subjectKind: "agent_run",
    },
    {
      id: "runs-succeeded",
      label: "Runs succeeded",
      status: input.runs.length > 0 && badRuns.length === 0 ? "pass" : "fail",
      details: input.runs.length === 0
        ? "No agent runs were found for final QA tasks."
        : badRuns.length === 0
        ? `${input.runs.length} run(s) succeeded.`
        : `${badRuns.length} run(s) are not succeeded.`,
      subjectKind: "agent_run",
    },
    {
      id: "artifacts-linked",
      label: "Artifacts linked",
      status: input.summary.artifactCount > 0 ? "pass" : "warn",
      details: input.summary.artifactCount > 0
        ? `${input.summary.artifactCount} artifact(s) linked to final QA tasks.`
        : "No task artifacts were found; continue only if the work produced no artifacts.",
      subjectKind: "artifact",
    },
  ];
}

function finalQaNextAction(
  failed: boolean,
  taskResults: FinalQaTaskResult[],
  openFeedbackRunCount: number,): FinalQaNextAction {
  if (!failed) return "prompt_uat_code_review";
  if (
    openFeedbackRunCount > 0 ||
    taskResults.some((task) => task.latestVerdict === "REVISE" || task.latestVerdict === "RETHINK")) {
    return "continue_automated_feedback";
  }
  return "manual_review_required";
}

function reviewSessionsFor(finalQa: FinalQaReportOutput, traceId: string): UatCodeReviewSession[] {
  const taskIds = finalQa.taskResults.map((task) => task.taskId);
  return [
    {
      id: sessionId("uat", finalQa.projectId, traceId),
      type: "uat",
      title: "User Acceptance Testing",
      status: "pending_user_decision",
      traceId,
      taskIds,
      promptMarkdown: uatPrompt(finalQa),
    },
    {
      id: sessionId("code-review", finalQa.projectId, traceId),
      type: "code_review",
      title: "Code Review",
      status: "pending_user_decision",
      traceId,
      taskIds,
      promptMarkdown: codeReviewPrompt(finalQa),
    },
  ];
}

function sessionId(kind: string, projectId: string, traceId: string): string {
  const source = traceId || projectId;
  return `${kind}-${source.replace(/[^a-zA-Z0-9_-]/g, "-")}`.slice(0, 128);
}

function readyDecisionOptions(): UatCodeReviewDecisionOption[] {
  return [
    {
      id: "start_uat",
      label: "Start UAT",
      description: "Open the UAT review flow against the final-QA evidence.",
    },
    {
      id: "start_code_review",
      label: "Start Code Review",
      description: "Open the code-review flow against the same trace and task evidence.",
    },
    {
      id: "request_changes",
      label: "Request Changes",
      description: "Send UAT/code-review feedback back into automated agent loops.",
    },
    {
      id: "approve_without_manual_review",
      label: "Approve Without Manual Review",
      description: "Record explicit user approval and continue to real-data E2E generation.",
    },
  ];
}

function blockedDecisionOptions(finalQa: FinalQaReportOutput): UatCodeReviewDecisionOption[] {
  return [
    {
      id: finalQa.nextAction === "continue_automated_feedback" ? "continue_automated_feedback" : "manual_review_required",
      label: finalQa.nextAction === "continue_automated_feedback" ? "Continue Feedback" : "Manual Review Required",
      description: "Resolve final-QA blockers before prompting the user for UAT or code review.",
    },
  ];
}

function readyPrompt(finalQa: FinalQaReportOutput, sessions: UatCodeReviewSession[]): string {
  return [
    "# UAT And Code Review Handoff",
    "",
    `Trace: ${finalQa.traceId ?? "none"}`,
    `Final QA: ${finalQa.status}`,
    "Next action: prompt_user_for_uat_code_review",
    "",
    "## Review Sessions",...sessions.map((session) => `- ${session.title}: ${session.id} (${session.status})`),
    "",
    "## Final QA Summary",
    `- Tasks: ${finalQa.summary.taskCount}`,
    `- Docs: ${finalQa.summary.docCount}`,
    `- Runs: ${finalQa.summary.runCount}`,
    `- Artifacts: ${finalQa.summary.artifactCount}`,
    `- Open feedback runs: ${finalQa.summary.openFeedbackRunCount}`,
    "",
    "## Success Criteria",...criteriaLines(finalQa.taskResults),
    "",
    "## Decision Options",...readyDecisionOptions().map((option) => `- ${option.id}: ${option.description}`),
  ].join("\n");
}

function blockedPrompt(finalQa: FinalQaReportOutput): string {
  return [
    "# UAT And Code Review Handoff Blocked",
    "",
    "Final QA has not passed.",
    `Trace: ${finalQa.traceId ?? "none"}`,
    `Final QA: ${finalQa.status}`,
    `Next action: ${finalQa.nextAction}`,
    "",
    "## Blocking Checks",...finalQa.checks.filter((check) => check.status === "fail").map((check) => `- ${check.id}: ${check.details}`),
  ].join("\n");
}

function uatPrompt(finalQa: FinalQaReportOutput): string {
  return [
    "# User Acceptance Testing",
    "",
    `Trace: ${finalQa.traceId ?? "none"}`,
    "Review the accepted workflow against the success criteria below.",
    "",...criteriaLines(finalQa.taskResults),
    "",
    "Submit approval, requested changes, or skipped-with-reason.",
  ].join("\n");
}

function codeReviewPrompt(finalQa: FinalQaReportOutput): string {
  return [
    "# Code Review",
    "",
    `Trace: ${finalQa.traceId ?? "none"}`,
    "Review implementation evidence, task runs, artifacts, and linked criteria before approval.",
    "",...finalQa.taskResults.map((task) => (
      `- ${task.title} (${task.taskId}): verdict ${task.latestVerdict ?? "none"}, artifacts ${task.artifactIds.length}`)),
    "",
    "Submit approval, requested changes, or skipped-with-reason.",
  ].join("\n");
}

function criteriaLines(tasks: FinalQaTaskResult[]): string[] {
  const lines: string[] = [];
  for (const task of tasks) {
    lines.push(`- ${task.title} (${task.taskId})`);
    for (const criterion of task.successCriteria) {
      lines.push(`  - ${criterion}`);
    }
  }
  return lines.length ? lines : ["- No explicit success criteria were found."];
}

async function scheduleTypeOrmUatFeedbackRuns(
  manager: EntityManager,
  input: UatCodeReviewDecisionInput,
  traceId: string,
  tasks: FinalQaTaskResult[],): Promise<UatCodeReviewFeedbackRun[]> {
  const feedbackRuns: UatCodeReviewFeedbackRun[] = [];
  for (const task of tasks) {
    const agent = input.feedbackAgent?.trim() || "codex";
    const run = {
      id: reviewWorkflowId("run", traceId, "uat-feedback", task.taskId),
      projectId: input.projectId,
      taskId: task.taskId,
      traceId,
      status: "queued",
      dependencyTree: [],
    };
    await manager.getRepository(FulcrumAgentRunEntity).save(run);
    feedbackRuns.push({
      id: run.id,
      taskId: task.taskId,
      agent,
      status: run.status,
    });
  }
  return feedbackRuns;
}

async function generateTypeOrmE2eRegressionTests(
  manager: EntityManager,
  input: UatCodeReviewDecisionInput,
  traceId: string,
  tasks: FinalQaTaskResult[],): Promise<GeneratedE2eRegressionTest[]> {
  const runner = input.e2eRunner ?? "bun";
  const sourceTasks = tasks.length > 0 ? tasks : [{
    taskId: input.projectId,
    title: "Project acceptance",
    status: null,
    successCriteria: ["Project acceptance approved."],
    latestVerdict: "APPROVE" as const,
    latestReviewEventId: null,
    unresolvedDependencyIds: [],
    runIds: [],
    openFeedbackRunIds: [],
    artifactIds: [],
  }];
  const generated: GeneratedE2eRegressionTest[] = [];

  for (const task of sourceTasks) {
    const coverageCases = buildCoverageCases(task);
    const manualSimulationChecklist = buildManualSimulationChecklist({
      projectId: input.projectId,
      traceId,
      tasks: [task],
      approvedForE2e: true,
    });
    const filename = `uat-${slug(traceId)}-${slug(task.title)}.spec.ts`;
    const filePath = `generated/e2e/${filename}`;
    const body = buildTypeOrmRegressionTestBody({
      traceId,
      projectId: input.projectId,
      task,
      coverageCases,
      manualSimulationChecklist,
      runner,
    });
    const id = reviewWorkflowId("e2e", traceId, task.taskId);
    await manager.getRepository(FulcrumGeneratedE2ETestEntity).save({
      id,
      projectId: input.projectId,
      traceId,
      sourceUatSessionId: sessionId("uat", input.projectId, traceId),
      runner,
      filePath,
      status: "accepted",
      bodyMd: body,
    });
    generated.push({
      artifactId: id,
      filename,
      path: filePath,
      runner,
      storePath: filePath,
      bodyPath: filePath,
      mime: runner === "playwright" ? "text/typescript" : "text/typescript",
      body,
      sourceTaskIds: [task.taskId],
      sourceCriteria: task.successCriteria,
      coverageCases,
      manualSimulationChecklist,
      ciCommand: runner === "playwright"
        ? ["bun", "run", "web:e2e:generated"]
        : ["bun", "test", filePath],
      ciEnv: runner === "playwright"
        ? { FULCRUM_GENERATED_E2E_FILES: filePath, FULCRUM_GENERATED_E2E_RUNNER: "playwright" }
        : { FULCRUM_GENERATED_E2E_FILES: filePath, FULCRUM_GENERATED_E2E_RUNNER: "bun" },
    });
  }

  return generated;
}

async function markTypeOrmReviewStarted(
  manager: EntityManager,
  input: UatCodeReviewDecisionInput,
  traceId: string,): Promise<void> {
  if (input.decision === "start_uat") {
    await manager.getRepository(FulcrumUatSessionEntity).save({
      id: sessionId("uat", input.projectId, traceId),
      projectId: input.projectId,
      traceId,
      status: "in_review",
      finalQaEventId: null,
      approvedAt: null,
    });
    return;
  }
  if (input.decision === "start_code_review") {
    await manager.getRepository(FulcrumReviewSessionEntity).save({
      id: sessionId("code-review", input.projectId, traceId),
      projectId: input.projectId,
      traceId,
      reviewType: "code_review",
      subjectId: input.projectId,
      status: "in_review",
      revision: 1,
      summary: {
        decision: input.decision,
        reviewType: input.reviewType,
      },
    });
  }
}

function buildCoverageCases(task: FinalQaTaskResult): GeneratedE2eCoverageCase[] {
  return task.successCriteria.map((criterion, index) => ({
    id: `${task.taskId}:${index + 1}`,
    taskId: task.taskId,
    taskTitle: task.title,
    criterion,
    artifactIds: task.artifactIds,
    runIds: task.runIds,
    latestReviewEventId: task.latestReviewEventId,
  }));
}

function buildTypeOrmRegressionTestBody(input: {
  traceId: string;
  projectId: string;
  task: FinalQaTaskResult;
  coverageCases: GeneratedE2eCoverageCase[];
  manualSimulationChecklist: ManualSimulationChecklist;
  runner: GeneratedE2eRegressionRunner;
}): string {
  const assertion = {
    traceId: input.traceId,
    projectId: input.projectId,
    task: {
      id: input.task.taskId,
      title: input.task.title,
      successCriteria: input.task.successCriteria,
      artifactIds: input.task.artifactIds,
      runIds: input.task.runIds,
    },
    coverageCases: input.coverageCases,
    manualSimulationChecklist: input.manualSimulationChecklist,
  };
  const importLine = input.runner === "playwright"
    ? 'import { expect, test } from "@playwright/test";'
    : 'import { describe, expect, test } from "bun:test";';
  if (input.runner === "playwright") {
    return [
      importLine,
      "",
      `const acceptedTrace = ${JSON.stringify(assertion, null, 2)} as const;`,
      "",
      `test("preserves approved UAT evidence for ${input.task.title}", async () => {`,
      "  expect(acceptedTrace.coverageCases.map((coverage) => coverage.criterion)).toEqual(acceptedTrace.task.successCriteria);",
      '  expect(acceptedTrace.manualSimulationChecklist.status).toBe("approved");',
      "  expect(acceptedTrace.manualSimulationChecklist.steps.map((step) => step.expectedObservation)).toEqual(acceptedTrace.coverageCases.map((coverage) => coverage.criterion));",
      "  expect(acceptedTrace.task.artifactIds.length).toBeGreaterThan(0);",
      "  expect(acceptedTrace.task.runIds.length).toBeGreaterThan(0);",
      "});",
      "",
    ].join("\n");
  }
  return [
    importLine,
    "",
    `const acceptedTrace = ${JSON.stringify(assertion, null, 2)} as const;`,
    "",
    `describe("Generated UAT regression: ${input.traceId}", () => {`,
    `  test("preserves approved UAT evidence for ${input.task.title}", () => {`,
    "    expect(acceptedTrace.coverageCases.map((coverage) => coverage.criterion)).toEqual(acceptedTrace.task.successCriteria);",
    '    expect(acceptedTrace.manualSimulationChecklist.status).toBe("approved");',
    "    expect(acceptedTrace.manualSimulationChecklist.steps.map((step) => step.expectedObservation)).toEqual(acceptedTrace.coverageCases.map((coverage) => coverage.criterion));",
    "    expect(acceptedTrace.task.artifactIds.length).toBeGreaterThan(0);",
    "    expect(acceptedTrace.task.runIds.length).toBeGreaterThan(0);",
    "  });",
    "});",
    "",
  ].join("\n");
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "trace";
}

function renderFinalQaMarkdown(input: Omit<FinalQaReportOutput, "readyForUserAcceptance" | "markdown">): string {
  const lines = [
    "# Final QA Report",
    "",
    `Project: ${input.projectId}`,
    input.traceId ? `Trace: ${input.traceId}` : null,
    `Status: ${input.status}`,
    `Next action: ${input.nextAction}`,
    "",
    "## Summary",
    "",
    `- Tasks: ${input.summary.taskCount}`,
    `- Docs: ${input.summary.docCount}`,
    `- Runs: ${input.summary.runCount}`,
    `- Artifacts: ${input.summary.artifactCount}`,
    `- Success criteria: ${input.summary.successCriteriaCount}`,
    `- Open feedback runs: ${input.summary.openFeedbackRunCount}`,
    "",
    "## Checks",
    "",...input.checks.map((check) => `- ${check.status.toUpperCase()} ${check.id}: ${check.details}`),
    "",
    "## Tasks",
    "",...input.taskResults.flatMap((task) => [
      `- ${task.taskId} ${task.title} (${task.status ?? "unknown"}) verdict=${task.latestVerdict ?? "missing"}`,...task.successCriteria.map((criterion) => `  - ${criterion}`),
    ]),
  ].filter((line): line is string => line !== null);
  return `${lines.join("\n")}\n`;
}

function latestReviewEvents(
  events: Array<{ id: string; targetId: string; payload: Record<string, unknown>; createdAt?: Date }>,): Map<string, { id: string; payload: Record<string, unknown> }> {
  const latest = new Map<string, { id: string; payload: Record<string, unknown> }>;
  for (const event of events) {
    latest.set(event.targetId, { id: event.id, payload: event.payload });
  }
  return latest;
}

function groupValues<T, V>(
  values: T[],
  keyFor: (value: T) => string | null | undefined,
  valueFor: (value: T) => V,): Map<string, V[]> {
  const grouped = new Map<string, V[]>;
  for (const value of values) {
    const key = keyFor(value);
    if (!key) continue;
    const group = grouped.get(key) ?? [];
    group.push(valueFor(value));
    grouped.set(key, group);
  }
  return grouped;
}

function verdictFromPayload(payload: Record<string, unknown> | undefined): FinalQaTaskResult["latestVerdict"] {
  const verdict = typeof payload?.["verdict"] === "string" ? payload["verdict"].toUpperCase() : null;
  if (verdict === "APPROVE" || verdict === "REVISE" || verdict === "RETHINK" || verdict === "UNAVAILABLE") {
    return verdict;
  }
  return null;
}

function isSatisfiedTaskStatus(status: string | null): boolean {
  const normalized = (status ?? "").trim().toLowerCase().replaceAll("_", "-");
  return ["done", "completed", "complete", "closed", "succeeded", "in-review", "archived"].includes(normalized);
}

function isSucceededRunStatus(status: string | null): boolean {
  const normalized = (status ?? "").trim().toLowerCase().replaceAll("_", "-");
  return ["succeeded", "success", "done", "completed"].includes(normalized);
}

function isOpenRunStatus(status: string | null): boolean {
  const normalized = (status ?? "").trim().toLowerCase().replaceAll("_", "-");
  return ["queued", "running", "in-progress", "retry-queued", "claimed", "unclaimed"].includes(normalized);
}

async function nextRunEventSequence(manager: EntityManager, runId: string): Promise<number> {
  const row = await manager.getRepository(FulcrumRunEventEntity).createQueryBuilder("event").select("MAX(event.sequence)", "max").where("event.runId = :runId", { runId }).getRawOne<{ max: string | number | null }>();
  const max = row?.max == null ? 0 : Number(row.max);
  return Number.isFinite(max) ? max + 1 : 1;
}

function reviewWorkflowId(prefix: string,...parts: string[]): string {
  const normalized = parts.join("-").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-").toLowerCase();
  return `${prefix}-${normalized}`.slice(0, 128);
}
