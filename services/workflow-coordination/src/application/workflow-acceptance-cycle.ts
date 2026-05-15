import "reflect-metadata";

import { Inject, Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

import type {
  DependencyRunDispatchOutput,
  DependencyRunLifecycleEventOutput,
  TaskQaReviewInput,
  TaskQaReviewOutput,
} from "@workflow-coordination/application/dependency-execution.service.ts";
import { DependencyRunService } from "@workflow-coordination/application/dependency-execution.service.ts";
import type {
  FinalQaReport,
  GeneratedE2eRegressionRun,
  UatCodeReviewDecision,
  UatCodeReviewHandoff,
} from "@workflow-coordination/application/review-workbench.service.ts";
import { ReviewWorkbenchService } from "@workflow-coordination/application/review-workbench.service.ts";
import type {
  ApprovedPlanMaterializeResult,
  GuidedAcpPermissionMode,
  PlanningFreeformStartResult,
  PlanningGuidedAcpStartResult,
} from "@workflow-coordination/application/planning-preview.service.ts";
import { PlanningPreviewService } from "@workflow-coordination/application/planning-preview.service.ts";

export interface WorkflowAcceptanceCycleInput {
  workspace: {
    id: string;
    slug: string;
    name: string;
  };
  project: {
    id: string;
    slug: string;
    name: string;
    traceId: string;
  };
  freeform: {
    documentId: string;
    title: string;
    bodyMd: string;
    userPrompt: string;
  };
  guidedPlanning: {
    acpSessionId: string;
    agentName: string;
    cwd: string;
    modeId?: string;
    modelId?: string;
    permissionMode?: GuidedAcpPermissionMode;
  };
  approvedPlan: {
    planId: string;
    reviewId: string;
    markdown: string;
  };
  execution: {
    agent: string;
    model?: string;
    prompt: string;
    lifecycleSummary: string;
    qaReviewText: string;
    qaReviewType?: TaskQaReviewInput["reviewType"];
  };
  uat: {
    decision: "start_uat" | "start_code_review" | "request_changes" | "approve_without_manual_review";
    reviewType: "uat" | "code_review";
    feedbackText?: string;
    e2eRunner?: "bun" | "playwright";
  };
}

export interface WorkflowAcceptanceCycleResult {
  traceId: string;
  freeform: PlanningFreeformStartResult;
  guidedPlanning: PlanningGuidedAcpStartResult;
  plan: ApprovedPlanMaterializeResult;
  materializedTaskIds: string[];
  dependencyRun: DependencyRunDispatchOutput;
  lifecycleEvents: DependencyRunLifecycleEventOutput[];
  qaReviews: TaskQaReviewOutput[];
  finalQa: FinalQaReport;
  handoff: UatCodeReviewHandoff;
  uatDecision: UatCodeReviewDecision;
  generatedE2e: GeneratedE2eRegressionRun;
}

export class WorkflowAcceptanceCycleService {
  constructor(private readonly dataSource: DataSource) {}

  async runCycle(input: WorkflowAcceptanceCycleInput): Promise<WorkflowAcceptanceCycleResult> {
    const planning = new PlanningPreviewService(this.dataSource);
    const execution = new DependencyRunService(this.dataSource);
    const review = new ReviewWorkbenchService(this.dataSource);
    const traceId = input.project.traceId;

    const freeform = await planning.startFreeformWork({
      workspaceId: input.workspace.id,
      workspaceSlug: input.workspace.slug,
      workspaceName: input.workspace.name,
      projectId: input.project.id,
      projectSlug: input.project.slug,
      projectName: input.project.name,
      documentId: input.freeform.documentId,
      title: input.freeform.title,
      bodyMd: input.freeform.bodyMd,
      userPrompt: input.freeform.userPrompt,
      traceId,
      acpSessionId: input.guidedPlanning.acpSessionId,
      modeId: input.guidedPlanning.modeId,
      modelId: input.guidedPlanning.modelId,
    });
    const guidedPlanning = await planning.startGuidedAcpPlanning({
      workspaceId: input.workspace.id,
      workspaceSlug: input.workspace.slug,
      workspaceName: input.workspace.name,
      projectId: input.project.id,
      projectSlug: input.project.slug,
      projectName: input.project.name,
      acpSessionId: input.guidedPlanning.acpSessionId,
      agentName: input.guidedPlanning.agentName,
      cwd: input.guidedPlanning.cwd,
      userPrompt: input.freeform.userPrompt,
      selectedDocIds: [freeform.document.id],
      traceId,
      modeId: input.guidedPlanning.modeId,
      modelId: input.guidedPlanning.modelId,
      permissionMode: input.guidedPlanning.permissionMode,
    });
    const plan = await planning.materializeApprovedPlan({
      workspaceId: input.workspace.id,
      workspaceSlug: input.workspace.slug,
      workspaceName: input.workspace.name,
      projectId: input.project.id,
      projectSlug: input.project.slug,
      projectName: input.project.name,
      planId: input.approvedPlan.planId,
      reviewId: input.approvedPlan.reviewId,
      traceId,
      approvedPlanMarkdown: input.approvedPlan.markdown,
      sourceDocRefs: [{ kind: "doc", id: freeform.document.id }],
    });
    const materializedTaskIds = plan.materialization.tasks.map((task) => task.id);
    const targetTaskId = materializedTaskIds.at(-1);
    if (!targetTaskId) throw new Error("Approved plan materialization did not produce a target task.");

    const dependencyRun = await execution.dispatchDependencyRun({
      workspaceId: input.workspace.id,
      workspaceSlug: input.workspace.slug,
      workspaceName: input.workspace.name,
      projectId: input.project.id,
      projectSlug: input.project.slug,
      projectName: input.project.name,
      mode: "task",
      targetTaskIds: [targetTaskId],
      traceId,
      agent: input.execution.agent,
      model: input.execution.model,
      prompt: input.execution.prompt,
    });

    const lifecycleEvents: DependencyRunLifecycleEventOutput[] = [];
    const qaReviews: TaskQaReviewOutput[] = [];
    for (const scheduledRun of dependencyRun.scheduledRuns) {
      lifecycleEvents.push(await execution.recordDependencyRunLifecycleEvent({
        projectId: input.project.id,
        runId: scheduledRun.id,
        taskId: scheduledRun.taskId,
        traceId,
        status: "succeeded",
        domain: "executor",
        mutationType: "dependency_run_completed",
        targetKind: "task",
        targetId: scheduledRun.taskId,
        agentId: input.execution.agent,
        taskLineageId: traceId,
        summary: input.execution.lifecycleSummary,
        output: input.execution.lifecycleSummary,
      }));
      qaReviews.push(await execution.recordTaskQaReview({
        workspaceId: input.workspace.id,
        workspaceSlug: input.workspace.slug,
        workspaceName: input.workspace.name,
        projectId: input.project.id,
        projectSlug: input.project.slug,
        projectName: input.project.name,
        taskId: scheduledRun.taskId,
        runId: scheduledRun.id,
        traceId,
        reviewType: input.execution.qaReviewType ?? "code",
        reviewText: input.execution.qaReviewText,
        reviewerAgent: "qa-reviewer",
        feedbackAgent: input.execution.agent,
        feedbackModel: input.execution.model,
      }));
    }

    const taskIds = [...materializedTaskIds];
    const finalQa = await review.buildFinalQaReport({
      workspaceId: input.workspace.id,
      workspaceSlug: input.workspace.slug,
      workspaceName: input.workspace.name,
      projectId: input.project.id,
      projectSlug: input.project.slug,
      projectName: input.project.name,
      traceId,
      taskIds,
    });
    const handoff = await review.buildUatCodeReviewHandoff({
      workspaceId: input.workspace.id,
      workspaceSlug: input.workspace.slug,
      workspaceName: input.workspace.name,
      projectId: input.project.id,
      projectSlug: input.project.slug,
      projectName: input.project.name,
      traceId,
      taskIds,
    });
    const uatDecision = await review.recordUatCodeReviewDecision({
      workspaceId: input.workspace.id,
      workspaceSlug: input.workspace.slug,
      workspaceName: input.workspace.name,
      projectId: input.project.id,
      projectSlug: input.project.slug,
      projectName: input.project.name,
      traceId,
      taskIds,
      decision: input.uat.decision,
      reviewType: input.uat.reviewType,
      feedbackText: input.uat.feedbackText,
      feedbackAgent: input.execution.agent,
      feedbackModel: input.execution.model,
      e2eRunner: input.uat.e2eRunner,
    });
    const generatedE2e = await review.runGeneratedE2eRegressionTests({
      workspaceId: input.workspace.id,
      workspaceSlug: input.workspace.slug,
      workspaceName: input.workspace.name,
      projectId: input.project.id,
      projectSlug: input.project.slug,
      projectName: input.project.name,
      traceId,
      runner: input.uat.e2eRunner,
      planOnly: true,
    });

    return {
      traceId,
      freeform,
      guidedPlanning,
      plan,
      materializedTaskIds,
      dependencyRun,
      lifecycleEvents,
      qaReviews,
      finalQa,
      handoff,
      uatDecision,
      generatedE2e,
    };
  }
}

Injectable()(WorkflowAcceptanceCycleService);
Inject(DataSource)(WorkflowAcceptanceCycleService, undefined, 0);
