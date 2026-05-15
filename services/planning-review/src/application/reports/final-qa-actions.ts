import type { EntityManager } from "typeorm";

import { AppValidationError } from "@platform-core/domain/errors.ts";
import { listDocs } from "@knowledge-workspace/application/docs/queries.ts";
import { appendEventOrm, ormSqlConnection } from "@platform-core/application/orm-helpers.ts";
import { listTasks } from "@work-management/application/work-item-queries.ts";
import type { TaskDto } from "@work-management/domain/work-item.ts";
import type {
  AppContext,
  BuildFinalQaReportInput,
  FinalQaCheck,
  FinalQaNextAction,
  FinalQaReportOutput,
  FinalQaTaskResult,
} from "@planning-review/domain/review-acceptance.ts";

type ReviewVerdict = FinalQaTaskResult["latestVerdict"];

interface QaReviewEventRow {
  id: string;
  taskId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface RunRow {
  id: string;
  taskId: string;
  status: string | null;
  agentName: string | null;
  createdAt: string;
}

export async function buildFinalQaReport(
  em: EntityManager,
  ctx: AppContext,
  input: BuildFinalQaReportInput,
): Promise<FinalQaReportOutput> {
  if (!input.projectId?.trim()) throw new AppValidationError("Final QA projectId is required.");
  const scopedCtx = { ...ctx, projectId: input.projectId };
  const allTasks = await listTasks(em, scopedCtx, {});
  const selectedTaskIds = new Set(input.taskIds ?? []);
  const tasks = selectedTaskIds.size > 0
    ? allTasks.filter((task) => selectedTaskIds.has(task.id))
    : allTasks;
  const docs = (await listDocs(em, scopedCtx, { archived: false }))
    .filter((doc) => doc.projectId === input.projectId);
  const reviewEvents = await loadQaReviewEvents(em, scopedCtx);
  const runs = await loadRunRows(em, scopedCtx);
  const artifacts = await loadArtifactRows(em, scopedCtx);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const artifactIdsByTask = groupValues(artifacts, (artifact) => artifact.taskId, (artifact) => artifact.id);
  const runsByTask = groupValues(runs, (run) => run.taskId, (run) => run);
  const latestReviewByTask = latestReviewEvents(reviewEvents);
  const taskResults = tasks.map((task) =>
    buildTaskResult({
      task,
      taskById,
      latestReview: latestReviewByTask.get(task.id) ?? null,
      runs: runsByTask.get(task.id) ?? [],
      artifactIds: artifactIdsByTask.get(task.id) ?? [],
    })
  );

  const summary = {
    taskCount: tasks.length,
    docCount: docs.length,
    runCount: runs.filter((run) => taskById.has(run.taskId)).length,
    artifactCount: artifacts.filter((artifact) => artifact.taskId && taskById.has(artifact.taskId)).length,
    successCriteriaCount: taskResults.reduce((sum, task) => sum + task.successCriteria.length, 0),
    approvedTaskCount: taskResults.filter((task) => task.latestVerdict === "APPROVE").length,
    blockedTaskCount: taskResults.filter((task) =>
      task.status === "blocked" || task.unresolvedDependencyIds.length > 0
    ).length,
    openFeedbackRunCount: taskResults.reduce((sum, task) => sum + task.openFeedbackRunIds.length, 0),
  };
  const checks = finalQaChecks({ docsCount: docs.length, taskResults, runs, summary });
  const failed = checks.some((check) => check.status === "fail");
  const nextAction = finalQaNextAction(failed, taskResults, summary.openFeedbackRunCount);
  const report: FinalQaReportOutput = {
    projectId: input.projectId,
    ...(input.traceId ? { traceId: input.traceId } : {}),
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

  await appendEventOrm(em, {
    orgId: scopedCtx.orgId,
    projectId: input.projectId,
    actor: "system",
    subjectKind: "project",
    subjectId: input.projectId,
    verb: "final_qa_completed",
    payload: {
      traceId: input.traceId,
      status: report.status,
      nextAction: report.nextAction,
      readyForUserAcceptance: report.readyForUserAcceptance,
      summary: report.summary,
      checks: report.checks.map((check) => ({
        id: check.id,
        status: check.status,
        details: check.details,
      })),
      taskIds: taskResults.map((task) => task.taskId),
    },
  });

  return report;
}

function buildTaskResult(input: {
  task: TaskDto;
  taskById: Map<string, TaskDto>;
  latestReview: QaReviewEventRow | null;
  runs: RunRow[];
  artifactIds: string[];
}): FinalQaTaskResult {
  const latestVerdict = verdictFromPayload(input.latestReview?.payload);
  return {
    taskId: input.task.id,
    title: input.task.title,
    status: input.task.status,
    successCriteria: extractTaskSuccessCriteria(input.task),
    latestVerdict,
    latestReviewEventId: input.latestReview?.id ?? null,
    unresolvedDependencyIds: unresolvedDependencyIds(input.task, input.taskById),
    runIds: input.runs.map((run) => run.id),
    openFeedbackRunIds: input.runs
      .filter((run) => isOpenRunStatus(run.status))
      .map((run) => run.id),
    artifactIds: input.artifactIds,
  };
}

function finalQaChecks(input: {
  docsCount: number;
  taskResults: FinalQaTaskResult[];
  runs: RunRow[];
  summary: FinalQaReportOutput["summary"];
}): FinalQaCheck[] {
  const criteriaTasks = input.taskResults.filter((task) => task.successCriteria.length > 0);
  const unapproved = criteriaTasks.filter((task) => task.latestVerdict !== "APPROVE");
  const unresolved = input.taskResults.filter((task) => task.unresolvedDependencyIds.length > 0);
  const scopedRuns = input.runs.filter((run) => input.taskResults.some((task) => task.taskId === run.taskId));
  const badRuns = scopedRuns.filter((run) => !isSucceededRunStatus(run.status));

  return [
    {
      id: "docs-present",
      label: "Project docs present",
      status: input.docsCount > 0 ? "pass" : "fail",
      details: input.docsCount > 0 ? `${input.docsCount} project doc(s) linked` : "No project docs were found for final QA.",
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
      status: scopedRuns.length > 0 && badRuns.length === 0 ? "pass" : "fail",
      details: scopedRuns.length === 0
        ? "No agent runs were found for final QA tasks."
        : badRuns.length === 0
        ? `${scopedRuns.length} run(s) succeeded.`
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

async function loadQaReviewEvents(em: EntityManager, ctx: AppContext): Promise<QaReviewEventRow[]> {
  const rows = await ormSqlConnection(em).execute<Array<{
    id: string;
    subject_id: string;
    payload: Record<string, unknown> | string | null;
    created_at: string | Date;
  }>>(
    `SELECT id, subject_id, payload, created_at
       FROM events
      WHERE org_id = ?
        AND project_id = ?
        AND subject_kind = 'task'
        AND verb = 'qa_review_recorded'
      ORDER BY created_at ASC, id ASC`,
    [ctx.orgId, ctx.projectId],
  );
  return rows.map((row) => ({
    id: row.id,
    taskId: row.subject_id,
    payload: normalizePayload(row.payload),
    createdAt: isoStamp(row.created_at),
  }));
}

async function loadRunRows(em: EntityManager, ctx: AppContext): Promise<RunRow[]> {
  const rows = await ormSqlConnection(em).execute<Array<{
    id: string;
    task_id: string | null;
    status: string | null;
    agent_name: string | null;
    created_at: string | Date;
  }>>(
    `SELECT ar.id, ar.task_id, ar.status, ar.agent_name, ar.created_at
       FROM agent_runs ar
       JOIN tasks t ON t.id = ar.task_id
      WHERE ar.org_id = ?
        AND t.project_id = ?
        AND t.deleted_at IS NULL
      ORDER BY ar.created_at ASC, ar.id ASC`,
    [ctx.orgId, ctx.projectId],
  );
  return rows
    .filter((row): row is typeof row & { task_id: string } => typeof row.task_id === "string")
    .map((row) => ({
      id: row.id,
      taskId: row.task_id,
      status: row.status,
      agentName: row.agent_name,
      createdAt: isoStamp(row.created_at),
    }));
}

async function loadArtifactRows(em: EntityManager, ctx: AppContext): Promise<Array<{ id: string; taskId: string | null }>> {
  const rows = await ormSqlConnection(em).execute<Array<{ id: string; task_id: string | null }>>(
    `SELECT a.id, a.task_id
       FROM artifacts a
       LEFT JOIN tasks t ON t.id = a.task_id
      WHERE a.org_id = ?
        AND (a.project_id = ? OR t.project_id = ?)
      ORDER BY a.created_at DESC, a.id ASC`,
    [ctx.orgId, ctx.projectId, ctx.projectId],
  );
  return rows.map((row) => ({ id: row.id, taskId: row.task_id ?? null }));
}

function latestReviewEvents(events: QaReviewEventRow[]): Map<string, QaReviewEventRow> {
  const latest = new Map<string, QaReviewEventRow>();
  for (const event of events) {
    latest.set(event.taskId, event);
  }
  return latest;
}

function unresolvedDependencyIds(task: TaskDto, taskById: Map<string, TaskDto>): string[] {
  return (task.dependencies?.blocked_by ?? []).filter((dependencyId) => {
    const dependency = taskById.get(dependencyId);
    return !dependency || !isSatisfiedTaskStatus(dependency.status);
  });
}

function extractTaskSuccessCriteria(task: TaskDto): string[] {
  const lines = task.descriptionText.split(/\r?\n/);
  const criteria: string[] = [];
  let inSuccessSection = false;

  for (const line of lines) {
    if (/^#{1,6}\s+success criteria\b/i.test(line.trim())) {
      inSuccessSection = true;
      continue;
    }
    if (inSuccessSection && /^#{1,6}\s+/.test(line.trim())) {
      inSuccessSection = false;
    }
    if (inSuccessSection) {
      const bullet = line.trim().match(/^[-*]\s+(.+)$/);
      if (bullet?.[1]) criteria.push(bullet[1].trim());
    }
    const inline = line.trim().match(/^success\s*:\s*(.+)$/i);
    if (inline?.[1]) criteria.push(inline[1].trim());
  }

  return [...new Set(criteria)].filter(Boolean);
}

function finalQaNextAction(
  failed: boolean,
  taskResults: FinalQaTaskResult[],
  openFeedbackRunCount: number,
): FinalQaNextAction {
  if (!failed) return "prompt_uat_code_review";
  if (
    openFeedbackRunCount > 0 ||
    taskResults.some((task) => task.latestVerdict === "REVISE" || task.latestVerdict === "RETHINK")
  ) {
    return "continue_automated_feedback";
  }
  return "manual_review_required";
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
    "",
    ...input.checks.map((check) => `- ${check.status.toUpperCase()} ${check.id}: ${check.details}`),
    "",
    "## Tasks",
    "",
    ...input.taskResults.flatMap((task) => [
      `- ${task.taskId} ${task.title} (${task.status ?? "unknown"}) verdict=${task.latestVerdict ?? "missing"}`,
      ...task.successCriteria.map((criterion) => `  - ${criterion}`),
    ]),
  ].filter((line): line is string => line !== null);
  return `${lines.join("\n")}\n`;
}

function groupValues<T, V>(
  values: T[],
  keyFor: (value: T) => string | null | undefined,
  valueFor: (value: T) => V,
): Map<string, V[]> {
  const grouped = new Map<string, V[]>();
  for (const value of values) {
    const key = keyFor(value);
    if (!key) continue;
    const group = grouped.get(key) ?? [];
    group.push(valueFor(value));
    grouped.set(key, group);
  }
  return grouped;
}

function verdictFromPayload(payload: Record<string, unknown> | undefined): ReviewVerdict {
  const verdict = typeof payload?.["verdict"] === "string" ? payload["verdict"].toUpperCase() : null;
  if (verdict === "APPROVE" || verdict === "REVISE" || verdict === "RETHINK" || verdict === "UNAVAILABLE") {
    return verdict;
  }
  return null;
}

function normalizePayload(payload: Record<string, unknown> | string | null): Record<string, unknown> {
  if (!payload) return {};
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return payload;
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

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
