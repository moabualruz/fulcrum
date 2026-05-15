import type { EntityManager } from "@mikro-orm/postgresql";

import { createDoc, updateDoc } from "@knowledge-workspace/application/docs/commands.ts";
import { getDoc } from "@knowledge-workspace/application/docs/queries.ts";
import type { AppContext, DocDto } from "@knowledge-workspace/application/docs/types.ts";
import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { appendEventOrm } from "@platform-core/application/orm-helpers.ts";
import { getTask } from "@work-management/application/work-item-queries.ts";
import type { TaskDto } from "@work-management/domain/work-item.ts";
import {
  buildFreeformPlanningPromptFromDocs,
  type FreeformPlanningPromptFromDocsResult,
} from "@planning-review/application/freeform-doc-actions.ts";

export type ContinuousUpdateTrigger = "manual_doc_edit" | "acp_session_update";

export interface ContinuousUpdateChangedDocInput {
  id?: string;
  title?: string;
  bodyMd?: string;
  parentId?: string | null;
}

export interface RestartPlanningCycleFromUpdatesInput {
  trigger: ContinuousUpdateTrigger;
  userPrompt: string;
  projectId?: string | null;
  traceId?: string;
  acpSessionId?: string;
  modeId?: string;
  modelId?: string;
  selectedDocIds?: string[];
  targetTaskIds?: string[];
  changedDocs?: ContinuousUpdateChangedDocInput[];
  maxDocChars?: number;
}

export interface ContinuousUpdateTargetTaskContext {
  id: string;
  title: string;
  status: string | null;
  descriptionText: string;
  blockedByTaskIds: string[];
  blocksTaskIds: string[];
  blockedByTasks: Array<{ id: string; title: string; status: string | null }>;
  blocksTasks: Array<{ id: string; title: string; status: string | null }>;
}

export interface RestartPlanningCycleFromUpdatesResult extends FreeformPlanningPromptFromDocsResult {
  status: "ready_for_replanning";
  trigger: ContinuousUpdateTrigger;
  traceId?: string;
  acpSessionId?: string;
  modeId?: string;
  modelId?: string;
  targetTaskIds: string[];
  targetTasks: ContinuousUpdateTargetTaskContext[];
  missingTargetTaskIds: string[];
  changedDocs: DocDto[];
  eventId: string;
}

export async function restartPlanningCycleFromUpdates(
  em: EntityManager,
  ctx: AppContext,
  input: RestartPlanningCycleFromUpdatesInput,
): Promise<RestartPlanningCycleFromUpdatesResult> {
  if (!input.userPrompt.trim()) throw new AppValidationError("userPrompt is required.");
  if (input.trigger === "manual_doc_edit" && !input.changedDocs?.length) {
    throw new AppValidationError("manual_doc_edit requires at least one changed document.");
  }

  const projectId = input.projectId ?? ctx.projectId ?? null;
  const scopedCtx = { ...ctx, projectId };
  const changedDocs = await persistChangedDocs(em, scopedCtx, input);
  const selectedDocIds = unique([
    ...(input.selectedDocIds ?? []),
    ...changedDocs.map((doc) => doc.id),
  ]);
  if (selectedDocIds.length === 0) {
    throw new AppValidationError("At least one selected or changed document is required to restart planning.");
  }

  const planning = await buildFreeformPlanningPromptFromDocs(em, scopedCtx, {
    userPrompt: input.userPrompt,
    selectedDocIds,
    traceId: input.traceId,
    maxDocChars: input.maxDocChars,
  });
  const taskContext = await loadTargetTaskContext(em, scopedCtx, input.targetTaskIds ?? []);
  const prompt = appendContinuousUpdateInstructions(planning.prompt, input, selectedDocIds, taskContext);
  const subjectId = input.traceId ?? input.acpSessionId ?? `planning-cycle:${selectedDocIds.join(",")}`;
  const event = await appendEventOrm(em, {
    orgId: ctx.orgId,
    projectId,
    actor: "system",
    subjectKind: "planning_cycle",
    subjectId,
    verb: "planning_cycle_restarted",
    payload: {
      trigger: input.trigger,
      traceId: input.traceId,
      acpSessionId: input.acpSessionId,
      modeId: input.modeId,
      modelId: input.modelId,
      selectedDocIds,
      changedDocIds: changedDocs.map((doc) => doc.id),
      targetTaskIds: input.targetTaskIds ?? [],
      targetTasks: taskContext.tasks,
      missingTargetTaskIds: taskContext.missingTaskIds,
      sourceRefs: planning.context.sourceRefs,
    },
  });

  return {
    status: "ready_for_replanning",
    trigger: input.trigger,
    traceId: input.traceId,
    acpSessionId: input.acpSessionId,
    modeId: input.modeId,
    modelId: input.modelId,
    targetTaskIds: input.targetTaskIds ?? [],
    targetTasks: taskContext.tasks,
    missingTargetTaskIds: taskContext.missingTaskIds,
    changedDocs,
    eventId: event.id,
    context: planning.context,
    prompt,
  };
}

async function persistChangedDocs(
  em: EntityManager,
  ctx: AppContext,
  input: RestartPlanningCycleFromUpdatesInput,
): Promise<DocDto[]> {
  const changedDocs = input.changedDocs ?? [];
  const persisted: DocDto[] = [];
  for (const doc of changedDocs) {
    if (doc.id) {
      const existing = await getDoc(em, ctx, doc.id);
      const updated = await updateDoc(em, ctx, {
        id: doc.id,
        ...(doc.title !== undefined ? { title: doc.title } : {}),
        ...(doc.bodyMd !== undefined ? { bodyMd: doc.bodyMd } : {}),
        ...(doc.parentId !== undefined ? { parentId: doc.parentId } : {}),
        frontmatter: {
          ...(existing?.frontmatter ?? {}),
          workflowKind: "continuous_update_replan",
          traceId: input.traceId,
          acpSessionId: input.acpSessionId,
          modeId: input.modeId,
          modelId: input.modelId,
          lastUpdateTrigger: input.trigger,
        },
      });
      if (!updated) throw new AppNotFoundError(`Document not found: ${doc.id}`);
      persisted.push(updated);
      continue;
    }

    if (!doc.title?.trim()) throw new AppValidationError("Changed document title is required when creating a new document.");
    const created = await createDoc(em, ctx, {
      title: doc.title,
      bodyMd: doc.bodyMd ?? "",
      parentId: doc.parentId ?? null,
      projectId: ctx.projectId ?? null,
      scope: ctx.projectId ? "project" : "global",
      docType: "scratch",
      frontmatter: {
        workflowKind: "continuous_update_replan",
        traceId: input.traceId,
        acpSessionId: input.acpSessionId,
        modeId: input.modeId,
        modelId: input.modelId,
        lastUpdateTrigger: input.trigger,
      },
      source: input.traceId ? { kind: "trace", id: input.traceId } : undefined,
    });
    persisted.push(created);
  }
  return persisted;
}

function appendContinuousUpdateInstructions(
  prompt: string,
  input: RestartPlanningCycleFromUpdatesInput,
  selectedDocIds: string[],
  taskContext: { tasks: ContinuousUpdateTargetTaskContext[]; missingTaskIds: string[] },
): string {
  return [
    prompt,
    "",
    "## Continuous update / replanning cycle",
    "Continue the Fulcrum workflow cycle from the updated context instead of starting from scratch.",
    `- Trigger: ${input.trigger}`,
    input.traceId ? `- Trace ID: ${input.traceId}` : null,
    input.acpSessionId ? `- ACP session: ${input.acpSessionId}` : null,
    input.modeId ? `- ACP mode: ${input.modeId}` : null,
    input.modelId ? `- ACP model: ${input.modelId}` : null,
    selectedDocIds.length ? `- Source docs: ${selectedDocIds.join(", ")}` : null,
    input.targetTaskIds?.length ? `- Existing tasks to reconcile: ${input.targetTaskIds.join(", ")}` : null,
    taskContext.tasks.length ? formatTargetTaskContext(taskContext.tasks) : null,
    taskContext.missingTaskIds.length ? `- Missing target task IDs: ${taskContext.missingTaskIds.join(", ")}` : null,
    "",
    "Update docs, prototype/boilerplate expectations, task breakdown, dependencies, and success criteria only where the changed context requires it. Preserve approved work that still satisfies the new context.",
  ].filter((line): line is string => line !== null).join("\n");
}

async function loadTargetTaskContext(
  em: EntityManager,
  ctx: AppContext,
  targetTaskIds: string[],
): Promise<{ tasks: ContinuousUpdateTargetTaskContext[]; missingTaskIds: string[] }> {
  const tasks: ContinuousUpdateTargetTaskContext[] = [];
  const missingTaskIds: string[] = [];
  const cache = new Map<string, TaskDto | null>();
  for (const taskId of unique(targetTaskIds)) {
    const task = await getTaskIfVisible(em, ctx, taskId, cache);
    if (!task) {
      missingTaskIds.push(taskId);
      continue;
    }
    const blockedByTaskIds = task.dependencies.blocked_by ?? [];
    const blocksTaskIds = task.dependencies.blocks ?? [];
    tasks.push({
      id: task.id,
      title: task.title,
      status: task.status,
      descriptionText: task.descriptionText,
      blockedByTaskIds,
      blocksTaskIds,
      blockedByTasks: await loadDependencySummaries(em, ctx, blockedByTaskIds, cache),
      blocksTasks: await loadDependencySummaries(em, ctx, blocksTaskIds, cache),
    });
  }
  return { tasks, missingTaskIds };
}

async function loadDependencySummaries(
  em: EntityManager,
  ctx: AppContext,
  taskIds: string[],
  cache: Map<string, TaskDto | null>,
): Promise<Array<{ id: string; title: string; status: string | null }>> {
  const summaries = [];
  for (const taskId of taskIds) {
    const task = await getTaskIfVisible(em, ctx, taskId, cache);
    summaries.push({
      id: taskId,
      title: task?.title ?? "(missing task)",
      status: task?.status ?? null,
    });
  }
  return summaries;
}

async function getTaskIfVisible(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
  cache: Map<string, TaskDto | null>,
): Promise<TaskDto | null> {
  if (!isUuidLike(taskId)) return null;
  if (cache.has(taskId)) return cache.get(taskId) ?? null;
  try {
    const task = await getTask(em, ctx, taskId);
    cache.set(taskId, task);
    return task;
  } catch (error) {
    if (error instanceof AppNotFoundError) {
      cache.set(taskId, null);
      return null;
    }
    throw error;
  }
}

function formatTargetTaskContext(tasks: ContinuousUpdateTargetTaskContext[]): string {
  return [
    "### Target task context",
    ...tasks.map((task) => [
      `- ${task.title} (${task.id})`,
      `  Status: ${task.status ?? "unknown"}`,
      task.descriptionText ? `  Current success/context: ${task.descriptionText}` : null,
      task.blockedByTasks.length ? `  Blocked by: ${formatTaskSummaries(task.blockedByTasks)}` : null,
      task.blocksTasks.length ? `  Blocks: ${formatTaskSummaries(task.blocksTasks)}` : null,
    ].filter((line): line is string => line !== null).join("\n")),
  ].join("\n");
}

function formatTaskSummaries(tasks: Array<{ id: string; title: string; status: string | null }>): string {
  return tasks.map((task) => `${task.title} (${task.id}, ${task.status ?? "unknown"})`).join("; ");
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
