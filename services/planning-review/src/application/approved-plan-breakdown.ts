import type { EntityManager } from "typeorm";

import { createArtifact as createStoredArtifact } from "@workflow-coordination/application/artifacts/commands.ts";
import { createDoc } from "@knowledge-workspace/application/docs/commands.ts";
import type { CreateDocInput, DocSourceRef } from "@knowledge-workspace/application/docs/types.ts";
import { createTask, setDependencies } from "@work-management/application/work-item-commands.ts";
import type { AppContext, CreateTaskInput } from "@work-management/domain/work-item.ts";

export type ApprovedPlanArtifactKind = "prototype" | "boilerplate";
export type SuccessCriteriaScope = "plan" | "task";

export interface ApprovedPlanArtifact {
  kind: ApprovedPlanArtifactKind;
  path: string;
  title: string;
  traceId?: string;
  sourcePlanId: string;
}

export interface ApprovedPlanSuccessCriterion {
  id: string;
  text: string;
  scope: SuccessCriteriaScope;
  traceId?: string;
  taskClientKey?: string;
}

export interface ApprovedPlanDocDraft {
  clientKey: string;
  input: CreateDocInput;
}

export interface ApprovedPlanTaskDraft {
  clientKey: string;
  input: CreateTaskInput;
  blockedByClientKeys: string[];
  successCriteria: ApprovedPlanSuccessCriterion[];
  artifactPaths: string[];
  sourcePlanId: string;
  traceId?: string;
}

export interface ApprovedPlanDependencyUpdate {
  taskClientKey: string;
  blockedByClientKeys: string[];
}

export interface ApprovedPlanBreakdown {
  title: string;
  docs: ApprovedPlanDocDraft[];
  artifacts: ApprovedPlanArtifact[];
  successCriteria: ApprovedPlanSuccessCriterion[];
  taskDrafts: ApprovedPlanTaskDraft[];
  dependencyUpdates: ApprovedPlanDependencyUpdate[];
  warnings: string[];
}

export interface BuildApprovedPlanBreakdownInput {
  planId: string;
  approvedPlanMarkdown: string;
  traceId?: string;
  reviewId?: string;
  projectId?: string | null;
  cycleId?: string | null;
  moduleId?: string | null;
  sourceDocRefs?: DocSourceRef[];
}

export interface ApprovedPlanTaskDraftEdit {
  clientKey: string;
  title?: string;
  descriptionText?: string;
  points?: number | null;
  blockedByClientKeys?: string[];
  cycleId?: string | null;
  moduleId?: string | null;
}

export interface ApprovedPlanMaterializedDoc {
  clientKey: string;
  id: string;
}

export interface ApprovedPlanMaterializedTask {
  clientKey: string;
  id: string;
}

export interface ApprovedPlanMaterializedDependencyUpdate {
  taskClientKey: string;
  taskId: string;
  blockedByClientKeys: string[];
  blockedByTaskIds: string[];
}

export interface ApprovedPlanMaterializedArtifact extends ApprovedPlanArtifact {
  id: string;
}

export interface ApprovedPlanMaterializationResult {
  docs: ApprovedPlanMaterializedDoc[];
  artifacts: ApprovedPlanMaterializedArtifact[];
  tasks: ApprovedPlanMaterializedTask[];
  dependencyUpdates: ApprovedPlanMaterializedDependencyUpdate[];
}

export interface ApprovedPlanMaterializer {
  createDoc: (draft: ApprovedPlanDocDraft) => Promise<{ id: string }>;
  createArtifact: (artifact: ApprovedPlanArtifact) => Promise<{ id: string }>;
  createTask: (draft: ApprovedPlanTaskDraft) => Promise<{ id: string }>;
  setTaskDependencies?: (update: ApprovedPlanMaterializedDependencyUpdate) => Promise<void>;
}

interface ParsedPlanTask {
  clientKey: string;
  title: string;
  blockedByClientKeys: string[];
  successCriteria: string[];
}

export function buildApprovedPlanBreakdown(input: BuildApprovedPlanBreakdownInput): ApprovedPlanBreakdown {
  const markdown = normalizeMarkdown(input.approvedPlanMarkdown);
  const title = extractPlanTitle(markdown) ?? `Approved plan ${input.planId}`;
  const artifacts = parseArtifacts(markdown, input.planId, input.traceId);
  const planCriteria = parsePlanSuccessCriteria(markdown);
  const parsedTasks = parsePlanTasks(markdown);
  const warnings: string[] = [];
  const taskKeys = new Set(parsedTasks.map((task) => task.clientKey));

  for (const task of parsedTasks) {
    const knownDependencies = task.blockedByClientKeys.filter((dependency) => taskKeys.has(dependency));
    const unknownDependencies = task.blockedByClientKeys.filter((dependency) => !taskKeys.has(dependency));
    if (unknownDependencies.length > 0) {
      warnings.push(`Task ${task.clientKey} references unknown dependencies: ${unknownDependencies.join(", ")}`);
      task.blockedByClientKeys = knownDependencies;
    }
  }

  const explicitVerificationTask = parsedTasks.find((task) => task.clientKey === "verify-end-to-end");
  const allParsedTasks = explicitVerificationTask
    ? parsedTasks.map((task) => task.clientKey === "verify-end-to-end" && task.successCriteria.length === 0
      ? { ...task, successCriteria: verificationSuccessCriteria() }
      : task)
    : [...parsedTasks, buildVerificationTask(parsedTasks)];
  const successCriteria = buildSuccessCriteria({
    planId: input.planId,
    traceId: input.traceId,
    planCriteria,
    tasks: allParsedTasks,
  });
  const successCriteriaByTask = groupCriteriaByTask(successCriteria);
  const docs = buildApprovedPlanDocs({
    title,
    markdown,
    input,
    artifacts,
    successCriteria,
  });
  const taskDrafts = allParsedTasks.map((task) => buildTaskDraft({
    task,
    input,
    planTitle: title,
    artifacts,
    successCriteria: successCriteriaByTask.get(task.clientKey) ?? [],
  }));

  return {
    title,
    docs,
    artifacts,
    successCriteria,
    taskDrafts,
    dependencyUpdates: taskDrafts
      .filter((task) => task.blockedByClientKeys.length > 0)
      .map((task) => ({
        taskClientKey: task.clientKey,
        blockedByClientKeys: [...task.blockedByClientKeys],
      })),
    warnings,
  };
}

export function mergeApprovedPlanTaskDrafts(
  generatedTaskDrafts: ApprovedPlanTaskDraft[],
  edits: ApprovedPlanTaskDraftEdit[],
): ApprovedPlanTaskDraft[] {
  const generatedByKey = new Map(generatedTaskDrafts.map((task) => [task.clientKey, task]));

  return edits.map((edit) => {
    const generated = generatedByKey.get(edit.clientKey);
    if (!generated) {
      const title = edit.title?.trim() ?? "";
      if (!title) {
        throw new Error(`Client-added task draft must have a title: ${edit.clientKey}`);
      }
      const descriptionText = edit.descriptionText ?? title;
      return {
        clientKey: edit.clientKey,
        input: {
          title,
          descriptionText,
          taskType: "task",
          ...(edit.points !== undefined ? { points: edit.points } : {}),
          ...(edit.cycleId !== undefined ? { cycleId: edit.cycleId } : {}),
          ...(edit.moduleId !== undefined ? { moduleId: edit.moduleId } : {}),
        },
        blockedByClientKeys: normalizeDependencyKeys(edit.blockedByClientKeys),
        successCriteria: [],
        artifactPaths: [],
        sourcePlanId: "",
      };
    }

    return {
      ...generated,
      input: {
        ...generated.input,
        ...(edit.title !== undefined ? { title: edit.title.trim() } : {}),
        ...(edit.descriptionText !== undefined ? { descriptionText: edit.descriptionText } : {}),
        ...(edit.points !== undefined ? { points: edit.points } : {}),
        ...(edit.cycleId !== undefined ? { cycleId: edit.cycleId } : {}),
        ...(edit.moduleId !== undefined ? { moduleId: edit.moduleId } : {}),
      },
      blockedByClientKeys: edit.blockedByClientKeys
        ? normalizeDependencyKeys(edit.blockedByClientKeys)
        : [...generated.blockedByClientKeys],
    };
  });
}

export async function materializeApprovedPlanBreakdown(
  breakdown: ApprovedPlanBreakdown,
  materializer: ApprovedPlanMaterializer,
): Promise<ApprovedPlanMaterializationResult> {
  const docs: ApprovedPlanMaterializedDoc[] = [];
  for (const docDraft of breakdown.docs) {
    const created = await materializer.createDoc(docDraft);
    docs.push({ clientKey: docDraft.clientKey, id: created.id });
  }

  const artifacts: ApprovedPlanMaterializedArtifact[] = [];
  for (const artifact of breakdown.artifacts) {
    const created = await materializer.createArtifact(artifact);
    artifacts.push({ ...artifact, id: created.id });
  }

  const tasks: ApprovedPlanMaterializedTask[] = [];
  const taskIdsByClientKey = new Map<string, string>();
  for (const taskDraft of breakdown.taskDrafts) {
    const created = await materializer.createTask(taskDraft);
    taskIdsByClientKey.set(taskDraft.clientKey, created.id);
    tasks.push({ clientKey: taskDraft.clientKey, id: created.id });
  }

  const dependencyUpdates: ApprovedPlanMaterializedDependencyUpdate[] = [];
  for (const update of breakdown.dependencyUpdates) {
    const taskId = taskIdsByClientKey.get(update.taskClientKey);
    if (!taskId) {
      throw new Error(`Cannot set dependencies for unknown task draft: ${update.taskClientKey}`);
    }
    const blockedByTaskIds = update.blockedByClientKeys.map((clientKey) => {
      const id = taskIdsByClientKey.get(clientKey);
      if (!id) {
        throw new Error(`Cannot resolve dependency ${clientKey} for task draft: ${update.taskClientKey}`);
      }
      return id;
    });
    const materializedUpdate = {
      taskClientKey: update.taskClientKey,
      taskId,
      blockedByClientKeys: [...update.blockedByClientKeys],
      blockedByTaskIds,
    };
    dependencyUpdates.push(materializedUpdate);
    await materializer.setTaskDependencies?.(materializedUpdate);
  }

  return { docs, artifacts, tasks, dependencyUpdates };
}

export async function materializeApprovedPlanBreakdownWithApplicationCommands(
  em: EntityManager,
  ctx: AppContext,
  breakdown: ApprovedPlanBreakdown,
): Promise<ApprovedPlanMaterializationResult> {
  return materializeApprovedPlanBreakdown(breakdown, {
    createDoc: async (draft) => createDoc(em, ctx, draft.input),
    createArtifact: async (artifact) =>
      createStoredArtifact(em, ctx, {
        filename: artifact.title,
        path: artifact.path,
        mime: mimeForPlanArtifact(artifact.path),
        metadataJson: {
          lifecycleState: "pending_review",
          workflowStage: "approved_plan_artifact",
          kind: artifact.kind,
          title: artifact.title,
          path: artifact.path,
          sourcePlanId: artifact.sourcePlanId,
          ...(artifact.traceId ? { traceId: artifact.traceId } : {}),
          ...(ctx.projectId ? { projectId: ctx.projectId } : {}),
        },
      }),
    createTask: async (draft) => createTask(em, ctx, draft.input),
    setTaskDependencies: async (update) => {
      await setDependencies(em, ctx, update.taskId, {
        blocks: [],
        blocked_by: update.blockedByTaskIds,
      });
    },
  });
}

function mimeForPlanArtifact(path: string): string {
  if (/\.(tsx|ts)$/.test(path)) return "text/x-typescript";
  if (/\.(jsx|js)$/.test(path)) return "text/javascript";
  if (/\.json$/.test(path)) return "application/json";
  if (/\.mdx?$/.test(path)) return "text/markdown";
  return "text/plain";
}

function normalizeMarkdown(markdown: string): string {
  return markdown.replace(/\r\n?/g, "\n");
}

function extractPlanTitle(markdown: string): string | null {
  for (const line of markdown.split("\n")) {
    const match = line.match(/^#\s+(.+?)\s*$/);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function parseArtifacts(markdown: string, planId: string, traceId?: string): ApprovedPlanArtifact[] {
  const section = sectionBody(markdown, (heading) => (
    heading.includes("prototype") || heading.includes("boilerplate") || heading.includes("artifact")
  ));
  if (!section) return [];

  const artifacts: ApprovedPlanArtifact[] = [];
  for (const line of section.split("\n")) {
    const match = line.match(/^\s*[-*]\s*\[(prototype|boilerplate)]\s+(.+?)\s*$/i);
    if (!match?.[1] || !match[2]) continue;
    const path = stripWrappingPunctuation(match[2].trim());
    artifacts.push({
      kind: match[1].toLowerCase() as ApprovedPlanArtifactKind,
      path,
      title: path.split("/").filter(Boolean).at(-1) ?? path,
      ...(traceId ? { traceId } : {}),
      sourcePlanId: planId,
    });
  }
  return artifacts;
}

function parsePlanSuccessCriteria(markdown: string): string[] {
  const section = sectionBody(markdown, (heading) => heading.includes("success") || heading.includes("acceptance"));
  if (!section) return [];
  return parseBulletText(section);
}

function parsePlanTasks(markdown: string): ParsedPlanTask[] {
  const section = sectionBody(markdown, (heading) => heading === "tasks" || heading.includes("task breakdown"));
  if (!section) return fallbackParsedTasks(markdown);

  const tasks: ParsedPlanTask[] = [];
  let current: ParsedPlanTask | null = null;

  for (const line of section.split("\n")) {
    const taskMatch = line.match(/^\s*[-*]\s*\[([^\]]+)]\s+(.+?)\s*$/);
    if (taskMatch?.[1] && taskMatch[2]) {
      current = {
        clientKey: taskMatch[1].trim(),
        title: taskMatch[2].trim(),
        blockedByClientKeys: [],
        successCriteria: [],
      };
      tasks.push(current);
      continue;
    }

    if (!current) continue;
    const detail = line.trim().replace(/^[-*]\s*/, "");
    const dependsMatch = detail.match(/^Depends on:\s*(.+?)\s*$/i)
      ?? detail.match(/^Dependencies:\s*(.+?)\s*$/i);
    if (dependsMatch?.[1]) {
      current.blockedByClientKeys = parseDependencyList(dependsMatch[1]);
      continue;
    }
    const successMatch = detail.match(/^Success(?: Criteria)?:\s*(.+?)\s*$/i);
    if (successMatch?.[1]?.trim()) {
      current.successCriteria.push(successMatch[1].trim());
    }
  }

  return tasks.length > 0 ? tasks : fallbackParsedTasks(markdown);
}

function fallbackParsedTasks(markdown: string): ParsedPlanTask[] {
  const title = extractPlanTitle(markdown) ?? "approved plan";
  return [
    {
      clientKey: "define-implementation-approach",
      title: "Define implementation approach",
      blockedByClientKeys: [],
      successCriteria: [`Implementation approach for ${title} is documented and ready for execution.`],
    },
    {
      clientKey: "implement-core-changes",
      title: "Implement core changes",
      blockedByClientKeys: ["define-implementation-approach"],
      successCriteria: [`Core changes for ${title} are implemented in the real Fulcrum source structure.`],
    },
  ];
}

function buildVerificationTask(tasks: ParsedPlanTask[]): ParsedPlanTask {
  const lastTask = tasks.at(-1);
  return {
    clientKey: "verify-end-to-end",
    title: "Verify end-to-end",
    blockedByClientKeys: lastTask ? [lastTask.clientKey] : [],
    successCriteria: verificationSuccessCriteria(),
  };
}

function verificationSuccessCriteria(): string[] {
  return ["Verify the full plan end-to-end against all success criteria and approved artifacts."];
}

function buildSuccessCriteria(input: {
  planId: string;
  traceId?: string;
  planCriteria: string[];
  tasks: ParsedPlanTask[];
}): ApprovedPlanSuccessCriterion[] {
  const criteria: ApprovedPlanSuccessCriterion[] = input.planCriteria.map((text, index) => ({
    id: `${input.planId}:plan:${index + 1}`,
    text,
    scope: "plan",
    ...(input.traceId ? { traceId: input.traceId } : {}),
  }));

  for (const task of input.tasks) {
    for (const text of task.successCriteria) {
      criteria.push({
        id: `${input.planId}:${task.clientKey}:${criteria.length + 1}`,
        text,
        scope: "task",
        taskClientKey: task.clientKey,
        ...(input.traceId ? { traceId: input.traceId } : {}),
      });
    }
  }

  return criteria;
}

function groupCriteriaByTask(criteria: ApprovedPlanSuccessCriterion[]): Map<string, ApprovedPlanSuccessCriterion[]> {
  const grouped = new Map<string, ApprovedPlanSuccessCriterion[]>();
  for (const criterion of criteria) {
    if (!criterion.taskClientKey) continue;
    grouped.set(criterion.taskClientKey, [
      ...(grouped.get(criterion.taskClientKey) ?? []),
      criterion,
    ]);
  }
  return grouped;
}

function buildApprovedPlanDocs(input: {
  title: string;
  markdown: string;
  input: BuildApprovedPlanBreakdownInput;
  artifacts: ApprovedPlanArtifact[];
  successCriteria: ApprovedPlanSuccessCriterion[];
}): ApprovedPlanDocDraft[] {
  const sourceLinks = [
    ...(input.input.sourceDocRefs ?? []).map((ref) => ({
      kind: ref.kind,
      id: ref.id,
      targetKind: ref.kind,
      targetId: ref.id,
      linkKind: "mention" as const,
    })),
    ...(input.input.reviewId ? [{
      kind: "review",
      id: input.input.reviewId,
      targetKind: "review",
      targetId: input.input.reviewId,
      linkKind: "mention" as const,
    }] : []),
  ] as CreateDocInput["links"];

  const docs: ApprovedPlanDocDraft[] = [{
    clientKey: "plan-doc",
    input: {
      title: input.title,
      bodyMd: input.markdown,
      projectId: input.input.projectId ?? null,
      scope: "project",
      docType: "spec",
      source: { kind: "plan", id: input.input.planId },
      links: sourceLinks,
      frontmatter: buildFrontmatter(input.input, "approved_plan"),
    },
  }];

  docs.push({
    clientKey: "success-criteria-doc",
    input: {
      title: `${input.title} success criteria`,
      bodyMd: renderSuccessCriteriaDoc(input.successCriteria),
      projectId: input.input.projectId ?? null,
      scope: "project",
      docType: "note",
      source: { kind: "plan", id: input.input.planId },
      frontmatter: buildFrontmatter(input.input, "success_criteria"),
    },
  });

  for (const [index, artifact] of input.artifacts.entries()) {
    docs.push({
      clientKey: `${artifact.kind}-${index + 1}-doc`,
      input: {
        title: artifact.title,
        bodyMd: renderArtifactDoc(artifact),
        projectId: input.input.projectId ?? null,
        scope: "project",
        docType: "note",
        source: { kind: "artifact", id: artifact.path },
        frontmatter: {
          ...buildFrontmatter(input.input, `${artifact.kind}_artifact`),
          artifactKind: artifact.kind,
          artifactPath: artifact.path,
        },
      },
    });
  }

  return docs;
}

function buildTaskDraft(input: {
  task: ParsedPlanTask;
  input: BuildApprovedPlanBreakdownInput;
  planTitle: string;
  artifacts: ApprovedPlanArtifact[];
  successCriteria: ApprovedPlanSuccessCriterion[];
}): ApprovedPlanTaskDraft {
  const artifactPaths = input.artifacts.map((artifact) => artifact.path);
  return {
    clientKey: input.task.clientKey,
    input: {
      title: input.task.title,
      descriptionText: renderTaskDescription({
        planTitle: input.planTitle,
        task: input.task,
        successCriteria: input.successCriteria,
        artifacts: input.artifacts,
        traceId: input.input.traceId,
      }),
      projectId: input.input.projectId ?? null,
      taskType: "task",
      ...(input.input.cycleId !== undefined ? { cycleId: input.input.cycleId } : {}),
      ...(input.input.moduleId !== undefined ? { moduleId: input.input.moduleId } : {}),
    },
    blockedByClientKeys: [...input.task.blockedByClientKeys],
    successCriteria: input.successCriteria,
    artifactPaths,
    sourcePlanId: input.input.planId,
    ...(input.input.traceId ? { traceId: input.input.traceId } : {}),
  };
}

function sectionBody(markdown: string, predicate: (normalizedHeading: string) => boolean): string | null {
  const lines = markdown.split("\n");
  let capture = false;
  const body: string[] = [];

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading?.[1]) {
      if (capture) break;
      capture = predicate(heading[1].trim().toLowerCase());
      continue;
    }
    if (capture) body.push(line);
  }

  return body.length > 0 ? body.join("\n").trim() : null;
}

function parseBulletText(section: string): string[] {
  return section.split("\n")
    .map((line) => line.match(/^\s*[-*]\s+(.+?)\s*$/)?.[1]?.trim())
    .filter((line): line is string => Boolean(line));
}

function parseDependencyList(value: string): string[] {
  if (/^(none|n\/a|no dependencies)$/i.test(value.trim())) return [];
  return normalizeDependencyKeys(value.split(/[,;]/).map((item) => item.trim()));
}

function normalizeDependencyKeys(value: string[] | undefined): string[] {
  return [...new Set((value ?? []).map((item) => item.trim()).filter(Boolean))];
}

function stripWrappingPunctuation(value: string): string {
  return value.replace(/^`|`$/g, "").replace(/^["']|["']$/g, "");
}

function buildFrontmatter(
  input: BuildApprovedPlanBreakdownInput,
  workflowStage: string,
): Record<string, unknown> {
  return {
    workflowStage,
    planId: input.planId,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    ...(input.reviewId ? { reviewId: input.reviewId } : {}),
    sourceDocIds: (input.sourceDocRefs ?? []).map((ref) => ref.id),
  };
}

function renderSuccessCriteriaDoc(criteria: ApprovedPlanSuccessCriterion[]): string {
  const planCriteria = criteria.filter((criterion) => criterion.scope === "plan");
  const taskCriteria = criteria.filter((criterion) => criterion.scope === "task");
  return [
    "# Success Criteria",
    "",
    "## Plan Criteria",
    renderCriteriaList(planCriteria),
    "",
    "## Task Criteria",
    renderCriteriaList(taskCriteria),
  ].join("\n").trimEnd();
}

function renderCriteriaList(criteria: ApprovedPlanSuccessCriterion[]): string {
  if (criteria.length === 0) return "- None captured.";
  return criteria.map((criterion) => `- ${criterion.text}`).join("\n");
}

function renderArtifactDoc(artifact: ApprovedPlanArtifact): string {
  return [
    `# ${artifact.title}`,
    "",
    `- kind: ${artifact.kind}`,
    `- path: ${artifact.path}`,
    `- source_plan_id: ${artifact.sourcePlanId}`,
    artifact.traceId ? `- trace_id: ${artifact.traceId}` : undefined,
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function renderTaskDescription(input: {
  planTitle: string;
  task: ParsedPlanTask;
  successCriteria: ApprovedPlanSuccessCriterion[];
  artifacts: ApprovedPlanArtifact[];
  traceId?: string;
}): string {
  const criteria = input.successCriteria.length > 0
    ? input.successCriteria.map((criterion) => `- ${criterion.text}`).join("\n")
    : "- No task-specific success criteria captured.";
  const artifacts = input.artifacts.length > 0
    ? input.artifacts.map((artifact) => `- [${artifact.kind}] ${artifact.path}`).join("\n")
    : "- No prototype or boilerplate artifacts captured.";
  const dependencies = input.task.blockedByClientKeys.length > 0
    ? input.task.blockedByClientKeys.map((dependency) => `- ${dependency}`).join("\n")
    : "- None";

  return [
    `Implement "${input.task.title}" as part of approved plan "${input.planTitle}".`,
    input.traceId ? `Trace ID: ${input.traceId}` : undefined,
    "",
    "## Success Criteria",
    criteria,
    "",
    "## Prototype / Boilerplate Artifacts",
    artifacts,
    "",
    "## Dependencies",
    dependencies,
    "",
    "## Source Plan",
    input.planTitle,
  ].filter((line): line is string => line !== undefined).join("\n");
}
