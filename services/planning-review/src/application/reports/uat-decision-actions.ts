import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { EntityManager } from "typeorm";

import { createStorageBackend } from "@workflow-coordination/infrastructure/artifacts/storage.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";
import { appendEventOrm } from "@platform-core/application/orm-helpers.ts";
import { dispatchTaskRun } from "@execution-orchestration/application/runs/commands.ts";
import { createTask } from "@work-management/application/work-item-commands.ts";
import { buildManualSimulationChecklist } from "@planning-review/application/manual-simulation-checklist.ts";
import { buildGeneratedE2eRunnerPlan } from "@planning-review/application/reports/generated-e2e-run-actions.ts";
import { buildUatCodeReviewHandoff } from "@planning-review/application/reports/uat-handoff-actions.ts";
import type {
  AppContext,
  FinalQaTaskResult,
  GeneratedE2eCoverageCase,
  GeneratedE2eMockPolicy,
  GeneratedE2eRegressionRunner,
  GeneratedE2eRegressionTest,
  GeneratedE2eScenarioData,
  RecordUatCodeReviewDecisionInput,
  UatCodeReviewDecisionOutput,
  UatCodeReviewFeedbackRun,
  UatCodeReviewHandoffOutput,
} from "@planning-review/domain/review-acceptance.ts";

export async function recordUatCodeReviewDecision(
  em: EntityManager,
  ctx: AppContext,
  input: RecordUatCodeReviewDecisionInput,
): Promise<UatCodeReviewDecisionOutput> {
  if (!input.decision) throw new AppValidationError("UAT/code review decision is required.");
  const handoff = await buildUatCodeReviewHandoff(em, ctx, input);
  if (handoff.status !== "ready") {
    const event = await appendEventOrm(em, {
      orgId: ctx.orgId,
      projectId: input.projectId,
      actor: ctx.userId ?? "system",
      subjectKind: "project",
      subjectId: input.projectId,
      verb: "uat_code_review_decision_recorded",
      payload: {
        traceId: input.traceId,
        decision: input.decision,
        reviewType: input.reviewType,
        status: "blocked",
        nextAction: "manual_review_required",
        reason: "final_qa_not_ready",
      },
    });
    return decisionOutput(input, handoff, {
      status: "blocked",
      nextAction: "manual_review_required",
      eventId: event.id,
    });
  }

  if (input.decision === "request_changes") {
    const feedbackRuns = await scheduleFeedbackRuns(em, ctx, input, handoff.finalQa.taskResults);
    const event = await appendEventOrm(em, {
      orgId: ctx.orgId,
      projectId: input.projectId,
      actor: ctx.userId ?? "system",
      subjectKind: "project",
      subjectId: input.projectId,
      verb: "uat_code_review_decision_recorded",
      payload: {
        traceId: input.traceId,
        decision: input.decision,
        reviewType: input.reviewType,
        status: "changes_requested",
        nextAction: "feedback_run_scheduled",
        feedbackRunIds: feedbackRuns.map((run) => run.id),
        feedbackText: input.feedbackText ?? null,
      },
    });
    return decisionOutput(input, handoff, {
      status: "changes_requested",
      nextAction: "feedback_run_scheduled",
      feedbackRuns,
      eventId: event.id,
    });
  }

  if (input.decision === "approve_without_manual_review") {
    const generatedE2eTests = await generateRealDataE2eRegressionArtifacts(em, ctx, input, handoff);
    const event = await appendEventOrm(em, {
      orgId: ctx.orgId,
      projectId: input.projectId,
      actor: ctx.userId ?? "system",
      subjectKind: "project",
      subjectId: input.projectId,
      verb: "uat_code_review_decision_recorded",
      payload: {
        traceId: input.traceId,
        decision: input.decision,
        reviewType: input.reviewType,
        status: "approved",
        nextAction: "real_data_e2e_generated",
        generatedE2eArtifactIds: generatedE2eTests.map((test) => test.artifactId),
        feedbackText: input.feedbackText ?? null,
      },
    });
    return decisionOutput(input, handoff, {
      status: "approved",
      nextAction: "real_data_e2e_generated",
      generatedE2eTests,
      eventId: event.id,
    });
  }

  const event = await appendEventOrm(em, {
    orgId: ctx.orgId,
    projectId: input.projectId,
    actor: ctx.userId ?? "system",
    subjectKind: "project",
    subjectId: input.projectId,
    verb: "uat_code_review_decision_recorded",
    payload: {
      traceId: input.traceId,
      decision: input.decision,
      reviewType: input.reviewType,
      status: "review_started",
      nextAction: "await_user_feedback",
      feedbackText: input.feedbackText ?? null,
    },
  });
  return decisionOutput(input, handoff, {
    status: "review_started",
    nextAction: "await_user_feedback",
    eventId: event.id,
  });
}

async function scheduleFeedbackRuns(
  em: EntityManager,
  ctx: AppContext,
  input: RecordUatCodeReviewDecisionInput,
  tasks: FinalQaTaskResult[],
): Promise<UatCodeReviewFeedbackRun[]> {
  if (!input.feedbackText?.trim()) throw new AppValidationError("Requested changes require feedback text.");
  const feedbackRuns: UatCodeReviewFeedbackRun[] = [];
  for (const task of tasks) {
    const run = await dispatchTaskRun(em, { ...ctx, projectId: input.projectId }, {
      taskId: task.taskId,
      agent: input.feedbackAgent?.trim() || "codex",
      model: input.feedbackModel ?? null,
      prompt: buildFeedbackPrompt(input, task),
    });
    feedbackRuns.push({
      id: run.id,
      taskId: task.taskId,
      agent: run.agent,
      status: run.status,
    });
  }
  return feedbackRuns;
}

async function generateRealDataE2eRegressionArtifacts(
  em: EntityManager,
  ctx: AppContext,
  input: RecordUatCodeReviewDecisionInput,
  handoff: UatCodeReviewHandoffOutput,
): Promise<GeneratedE2eRegressionTest[]> {
  const traceSlug = slug(input.traceId ?? input.projectId);
  const runner = input.e2eRunner ?? "bun";
  const generatedTests: GeneratedE2eRegressionTest[] = [];
  const tasks = (handoff.finalQa.taskResults.length > 0 ? handoff.finalQa.taskResults : [{
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
  }]).slice().sort((left, right) => left.title.localeCompare(right.title) || left.taskId.localeCompare(right.taskId));
  const splitByTask = tasks.length > 1;

  for (const task of tasks) {
    const artifactId = randomUUID();
    const runId = randomUUID();
    const sourceTaskIds = [task.taskId];
    const sourceCriteria = task.successCriteria;
    const coverageCases = buildCoverageCases(task);
    const scenarioData = buildScenarioData(input, task);
    const mockPolicy: GeneratedE2eMockPolicy = {
      usesMocks: false,
      impossibilityReason: null,
    };
    const manualSimulationChecklist = buildManualSimulationChecklist({
      projectId: input.projectId,
      traceId: input.traceId,
      tasks: [task],
      approvedForE2e: true,
    });
    const generationTaskDescription = buildGenerationTaskDescription({
      traceId: input.traceId,
      task,
      scenarioData,
      mockPolicy,
    });
    const generationTask = await createTask(em, { ...ctx, projectId: input.projectId }, {
      projectId: input.projectId,
      title: `Generate E2E regression: ${task.title}`,
      status: "todo",
      description: generationTaskDescription,
      descriptionText: generationTaskDescription,
    });
    const filename = splitByTask
      ? `uat-${traceSlug}-${slug(task.title)}.spec.ts`
      : `uat-${traceSlug}.spec.ts`;
    const path = `generated/e2e/${filename}`;
    const body = buildRegressionTestBody({
      traceId: input.traceId,
      projectId: input.projectId,
      tasks: [task],
      coverageCases,
      manualSimulationChecklist,
      scenarioData,
      mockPolicy,
      runner,
    });
    const stored = await createStorageBackend().put({
      orgSlug: ctx.orgId,
      projectSlug: input.projectId,
      runId,
      filename,
      source: Readable.from([body]),
    });
    const size = Buffer.byteLength(body, "utf8");
    const sha256 = createHash("sha256").update(body).digest("hex");
    const runnerPlan = buildGeneratedE2eRunnerPlan(runner, [stored.absolutePath]);
    await em.query(
      `insert into agent_runs (id, org_id, task_id, agent_name, status, created_at)
        values (?, ?, ?, ?, ?, now())`,
      [runId, ctx.orgId, generationTask.id, "e2e-generator", "succeeded"],
    );
    await em.query(
      `insert into artifacts (
        id, org_id, project_id, run_id, task_id, kind, title, filename, path,
        body_path, sha256, size, mime, metadata_json, created_at
      )
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, now())`,
      [
        artifactId,
        ctx.orgId,
        input.projectId,
        runId,
        generationTask.id,
        "test",
        filename,
        filename,
        path,
        stored.absolutePath,
        sha256,
        size,
        "text/typescript",
        JSON.stringify({
          lifecycleState: "accepted",
          generatedBy: "uat_code_review_approval",
          runner,
          ciCommand: runnerPlan.ciCommand,
          ciEnv: runnerPlan.ciEnv,
          coverageSummary: {
            taskCount: 1,
            criterionCount: coverageCases.length,
            artifactCount: task.artifactIds.length,
            runCount: task.runIds.length,
          },
          coverageCases,
          manualSimulationChecklist,
          scenarioData,
          mockPolicy,
          materializedFile: {
            storePath: stored.relativePath,
            bodyPath: stored.absolutePath,
            sha256,
            size,
          },
          traceId: input.traceId ?? null,
          projectId: input.projectId,
          reviewType: input.reviewType,
          decision: input.decision,
          generationTaskId: generationTask.id,
          sourceTaskIds,
          sourceCriteria,
          generatedTestBody: body,
        }),
      ],
    );
    generatedTests.push({
      artifactId,
      generationTaskId: generationTask.id,
      filename,
      path,
      runner,
      storePath: stored.relativePath,
      bodyPath: stored.absolutePath,
      mime: "text/typescript",
      body,
      sourceTaskIds,
      sourceCriteria,
      coverageCases,
      manualSimulationChecklist,
      scenarioData,
      mockPolicy,
      ciCommand: runnerPlan.ciCommand,
      ciEnv: runnerPlan.ciEnv,
    });
  }
  return generatedTests;
}

function decisionOutput(
  input: RecordUatCodeReviewDecisionInput,
  handoff: UatCodeReviewHandoffOutput,
  overrides: Partial<Pick<UatCodeReviewDecisionOutput, "status" | "nextAction" | "feedbackRuns" | "generatedE2eTests" | "eventId">>,
): UatCodeReviewDecisionOutput {
  return {
    projectId: input.projectId,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    decision: input.decision,
    reviewType: input.reviewType,
    status: overrides.status ?? "review_started",
    nextAction: overrides.nextAction ?? "await_user_feedback",
    handoff,
    feedbackRuns: overrides.feedbackRuns ?? [],
    generatedE2eTests: overrides.generatedE2eTests ?? [],
    eventId: overrides.eventId ?? "",
  };
}

function buildFeedbackPrompt(input: RecordUatCodeReviewDecisionInput, task: FinalQaTaskResult): string {
  return [
    `UAT/code-review feedback trace=${input.traceId ?? "none"}`,
    `task=${task.taskId}`,
    `reviewType=${input.reviewType}`,
    `feedback=${input.feedbackText?.trim() ?? ""}`,
    `criteria=${task.successCriteria.join(" | ")}`,
  ].join(" ").replace(/\s+/g, " ").slice(0, 255);
}

function buildRegressionTestBody(input: {
  traceId?: string;
  projectId: string;
  tasks: FinalQaTaskResult[];
  coverageCases: GeneratedE2eCoverageCase[];
  manualSimulationChecklist: ReturnType<typeof buildManualSimulationChecklist>;
  scenarioData: GeneratedE2eScenarioData;
  mockPolicy: GeneratedE2eMockPolicy;
  runner: GeneratedE2eRegressionRunner;
}): string {
  const coverage = input.coverageCases.map((coverageCase) => ({
    id: coverageCase.id,
    taskId: coverageCase.taskId,
    taskTitle: coverageCase.taskTitle,
    criterion: coverageCase.criterion,
    artifactIds: coverageCase.artifactIds,
    runIds: coverageCase.runIds,
    latestReviewEventId: coverageCase.latestReviewEventId,
  }));
  if (input.runner === "playwright") {
    return [
      'import { expect, test } from "@playwright/test";',
      "",
      `const acceptedTrace = ${JSON.stringify({ traceId: input.traceId ?? null, projectId: input.projectId, tasks: input.tasks.map((task) => ({ id: task.taskId, title: task.title, successCriteria: task.successCriteria, artifactIds: task.artifactIds, runIds: task.runIds })), coverageCases: coverage, manualSimulationChecklist: input.manualSimulationChecklist, scenarioData: input.scenarioData, mockPolicy: input.mockPolicy }, null, 2)} as const;`,
      "",
      `test.describe("Generated UAT regression: ${input.traceId ?? input.projectId}", () => {`,
      `  test("preserves approved final-QA evidence from Trace ${input.traceId ?? "none"}", async () => {`,
      "    expect(acceptedTrace.tasks.length).toBeGreaterThan(0);",
      "    expect(acceptedTrace.coverageCases.map((coverage) => coverage.criterion)).toEqual(acceptedTrace.tasks.flatMap((task) => task.successCriteria));",
      "    expect(acceptedTrace.tasks.every((task) => task.artifactIds.length > 0)).toBe(true);",
      '    expect(acceptedTrace.manualSimulationChecklist.status).toBe("approved");',
      "    expect(acceptedTrace.manualSimulationChecklist.steps.map((step) => step.expectedObservation)).toEqual(acceptedTrace.coverageCases.map((coverage) => coverage.criterion));",
      "    expect(acceptedTrace.scenarioData.evidenceArtifactIds).toEqual(acceptedTrace.tasks.flatMap((task) => task.artifactIds));",
      "    expect(acceptedTrace.mockPolicy).toEqual({ usesMocks: false, impossibilityReason: null });",
      "  });",
      "  for (const coverageCase of acceptedTrace.coverageCases) {",
      '    test(`covers ${coverageCase.taskTitle}: ${coverageCase.criterion}`, async () => {',
      "      expect(coverageCase.artifactIds.length).toBeGreaterThan(0);",
      "      expect(coverageCase.runIds.length).toBeGreaterThan(0);",
      "      expect(coverageCase.latestReviewEventId).toBeTruthy();",
      "    });",
      "  }",
      "});",
      "",
    ].join("\n");
  }
  return [
    'import { describe, expect, test } from "bun:test";',
    "",
    `const acceptedTrace = ${JSON.stringify({ traceId: input.traceId ?? null, projectId: input.projectId, tasks: input.tasks.map((task) => ({ id: task.taskId, title: task.title, successCriteria: task.successCriteria, artifactIds: task.artifactIds, runIds: task.runIds })), coverageCases: coverage, manualSimulationChecklist: input.manualSimulationChecklist, scenarioData: input.scenarioData, mockPolicy: input.mockPolicy }, null, 2)} as const;`,
    "",
    `describe("Generated UAT regression: ${input.traceId ?? input.projectId}", () => {`,
    `  test("preserves approved final-QA evidence from Trace ${input.traceId ?? "none"}", () => {`,
    "    expect(acceptedTrace.tasks.length).toBeGreaterThan(0);",
    "    expect(acceptedTrace.coverageCases.map((coverage) => coverage.criterion)).toEqual(acceptedTrace.tasks.flatMap((task) => task.successCriteria));",
    "    expect(acceptedTrace.tasks.every((task) => task.artifactIds.length > 0)).toBe(true);",
    '    expect(acceptedTrace.manualSimulationChecklist.status).toBe("approved");',
    "    expect(acceptedTrace.manualSimulationChecklist.steps.map((step) => step.expectedObservation)).toEqual(acceptedTrace.coverageCases.map((coverage) => coverage.criterion));",
    "    expect(acceptedTrace.scenarioData.evidenceArtifactIds).toEqual(acceptedTrace.tasks.flatMap((task) => task.artifactIds));",
    "    expect(acceptedTrace.mockPolicy).toEqual({ usesMocks: false, impossibilityReason: null });",
    "  });",
    "  for (const coverageCase of acceptedTrace.coverageCases) {",
    '    test(`covers ${coverageCase.taskTitle}: ${coverageCase.criterion}`, () => {',
    "      expect(coverageCase.artifactIds.length).toBeGreaterThan(0);",
    "      expect(coverageCase.runIds.length).toBeGreaterThan(0);",
    "      expect(coverageCase.latestReviewEventId).toBeTruthy();",
    "    });",
    "  }",
    "});",
    "",
  ].join("\n");
}

function buildScenarioData(
  input: RecordUatCodeReviewDecisionInput,
  task: FinalQaTaskResult,
): GeneratedE2eScenarioData {
  return {
    traceId: input.traceId ?? null,
    projectId: input.projectId,
    taskId: task.taskId,
    taskTitle: task.title,
    taskStatus: task.status,
    latestReviewEventId: task.latestReviewEventId,
    evidenceArtifactIds: task.artifactIds,
    evidenceRunIds: task.runIds,
  };
}

function buildGenerationTaskDescription(input: {
  traceId?: string;
  task: FinalQaTaskResult;
  scenarioData: GeneratedE2eScenarioData;
  mockPolicy: GeneratedE2eMockPolicy;
}): string {
  return [
    "## Scenario",
    `Trace: ${input.traceId ?? "none"}`,
    `Source task: ${input.task.taskId}`,
    `User path: ${input.task.title}`,
    "",
    "## Fixture data",
    `Task status: ${input.scenarioData.taskStatus ?? "unset"}`,
    `Review event: ${input.scenarioData.latestReviewEventId ?? "none"}`,
    "",
    "## Evidence artifacts",
    ...input.scenarioData.evidenceArtifactIds.map((id) => `- ${id}`),
    "",
    "## Evidence runs",
    ...input.scenarioData.evidenceRunIds.map((id) => `- ${id}`),
    "",
    "## Mock policy",
    input.mockPolicy.usesMocks
      ? `Mocks require documented impossibility reason: ${input.mockPolicy.impossibilityReason ?? "missing"}`
      : "Mocks are not used.",
  ].join("\n");
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

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "trace";
}
