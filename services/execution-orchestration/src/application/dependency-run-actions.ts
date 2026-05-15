import type { EntityManager } from "typeorm";
import { randomUUID } from "node:crypto";

import { dispatchTaskRun } from "@execution-orchestration/application/runs/commands.ts";
import { AppValidationError } from "@platform-core/domain/errors.ts";
import { appendEventOrm } from "@platform-core/application/orm-helpers.ts";
import { listTasks } from "@work-management/application/work-item-queries.ts";
import type { AppContext, TaskDto } from "@work-management/domain/work-item.ts";
import type { Column } from "@execution-orchestration/domain/dependency-order.ts";
import {
  buildDependencyRunPreview,
  type DependencyRunMode,
  type DependencyRunPreview,
  type DependencyRunPreviewTask,
} from "@execution-orchestration/domain/dependency-run-preview.ts";

export interface PreviewDependencyRunForTasksInput {
  mode: DependencyRunMode;
  targetTaskIds: string[];
  projectId?: string | null;
  traceId?: string;
}

export interface DispatchDependencyRunForTasksInput extends PreviewDependencyRunForTasksInput {
  agent: string;
  model?: string | null;
  prompt?: string | null;
}

export interface DispatchDependencyRunScheduledRun {
  id: string;
  taskId: string;
  agent: string;
  status: string;
  queuePosition: number;
  dependencyIds: string[];
}

export interface DispatchDependencyRunSkippedTask {
  id: string;
  title: string;
  column: Column;
  reason: string;
}

export interface DispatchDependencyRunForTasksOutput {
  runGroupId: string;
  preview: DependencyRunPreview;
  scheduledRuns: DispatchDependencyRunScheduledRun[];
  skippedTasks: DispatchDependencyRunSkippedTask[];
  warnings: string[];
}

export async function previewDependencyRunForTasks(
  em: EntityManager,
  ctx: AppContext,
  input: PreviewDependencyRunForTasksInput,): Promise<DependencyRunPreview> {
  const scopedCtx = {...ctx,
    projectId: input.projectId ?? ctx.projectId ?? null,
  };
  const tasks = await listTasks(em, scopedCtx, {});
  return buildDependencyRunPreview({
    mode: input.mode,
    targetTaskIds: input.targetTaskIds,
    tasks: tasks.map(toDependencyRunPreviewTask),...(input.traceId ? { traceId: input.traceId } : {}),
  });
}

export async function dispatchDependencyRunForTasks(
  em: EntityManager,
  ctx: AppContext,
  input: DispatchDependencyRunForTasksInput,): Promise<DispatchDependencyRunForTasksOutput> {
  if (!input.agent?.trim()) throw new AppValidationError("Dependency run agent is required.");
  const scopedCtx = {...ctx,
    projectId: input.projectId ?? ctx.projectId ?? null,
  };
  const preview = await previewDependencyRunForTasks(em, scopedCtx, input);
  if (preview.blocked) {
    throw new AppValidationError(`Cannot dispatch dependency run: ${preview.warnings.join(" ") || "preview is blocked."}`);
  }

  const activeTasks = preview.tasks.filter((task) => task.column === "in-progress");
  if (activeTasks.length > 0) {
    throw new AppValidationError(
      `Cannot dispatch dependency run: task(s) already in progress: ${activeTasks.map((task) => task.id).join(", ")}`,);
  }

  const runGroupId = input.traceId ?? randomUUID();
  const scheduledRuns: DispatchDependencyRunScheduledRun[] = [];
  const skippedTasks: DispatchDependencyRunSkippedTask[] = [];

  for (const task of preview.tasks) {
    if (isSatisfiedColumn(task.column)) {
      skippedTasks.push({
        id: task.id,
        title: task.title,
        column: task.column,
        reason: "already satisfied",
      });
      continue;
    }
    if (!isQueueableColumn(task.column)) {
      skippedTasks.push({
        id: task.id,
        title: task.title,
        column: task.column,
        reason: "not queueable",
      });
      continue;
    }

    const run = await dispatchTaskRun(em, scopedCtx, {
      taskId: task.id,
      agent: input.agent,
      model: input.model ?? null,
      prompt: dependencyRunPrompt(input, runGroupId, preview, task),
    });
    scheduledRuns.push({
      id: run.id,
      taskId: task.id,
      agent: run.agent,
      status: run.status,
      queuePosition: scheduledRuns.length + 1,
      dependencyIds: task.dependencyIds,
    });
  }

  await appendEventOrm(em, {
    orgId: scopedCtx.orgId,
    projectId: scopedCtx.projectId ?? null,
    actor: "system",
    subjectKind: "task",
    subjectId: preview.targetTaskIds[0] ?? runGroupId,
    verb: "dependency_tree_dispatched",
    payload: {
      traceId: runGroupId,
      mode: preview.mode,
      targetTaskIds: preview.targetTaskIds,
      orderedTaskIds: preview.orderedTaskIds,
      scheduledTaskIds: scheduledRuns.map((run) => run.taskId),
      scheduledRunIds: scheduledRuns.map((run) => run.id),
      skippedTaskIds: skippedTasks.map((task) => task.id),
      warnings: preview.warnings,
    },
  });

  return {
    runGroupId,
    preview,
    scheduledRuns,
    skippedTasks,
    warnings: preview.warnings,
  };
}

function toDependencyRunPreviewTask(task: TaskDto): DependencyRunPreviewTask {
  return {
    id: task.id,
    title: task.title,
    column: taskStatusToColumn(task.status),
    blockedBy: task.status === "blocked" ? "status is blocked" : null,
    dependencies: task.dependencies,
  };
}

function taskStatusToColumn(status: string | null): Column {
  const normalized = (status ?? "").trim().toLowerCase().replaceAll("_", "-");
  if (["done", "completed", "complete", "closed", "succeeded"].includes(normalized)) return "done";
  if (["in-review", "review", "reviewing"].includes(normalized)) return "in-review";
  if (["in-progress", "running", "active", "started"].includes(normalized)) return "in-progress";
  if (["archived", "cancelled", "canceled"].includes(normalized)) return "archived";
  if (normalized === "triage") return "triage";
  return "todo";
}

function isSatisfiedColumn(column: Column): boolean {
  return column === "done" || column === "in-review" || column === "archived";
}

function isQueueableColumn(column: Column): boolean {
  return column === "todo" || column === "triage";
}

function dependencyRunPrompt(
  input: DispatchDependencyRunForTasksInput,
  runGroupId: string,
  preview: DependencyRunPreview,
  task: DependencyRunPreview["tasks"][number],): string {
  const basePrompt = input.prompt?.trim();
  const position = preview.orderedTaskIds.indexOf(task.id) + 1;
  return [
    `Dependency run trace=${runGroupId}`,
    `mode=${preview.mode}`,
    `task=${task.id}`,
    `position=${position}/${preview.orderedTaskIds.length}`,
    `targets=${preview.targetTaskIds.length}`,
    basePrompt ? `prompt=${basePrompt}` : null,
  ].filter((part): part is string => Boolean(part)).join(" ").slice(0, 255);
}
