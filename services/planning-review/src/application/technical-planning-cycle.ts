import type { EntityManager } from "typeorm";

import { appendEventOrm } from "@platform-core/application/orm-helpers.ts";
import {
  buildApprovedPlanBreakdown,
  type ApprovedPlanBreakdown,
  type ApprovedPlanArtifactKind,
} from "@planning-review/application/approved-plan-breakdown.ts";
import {
  buildPlanningArtifactPreviews,
  type PlanningArtifactPreview,
} from "@planning-review/application/artifact-preview.ts";
import {
  buildFreeformPlanningPromptFromDocs,
  type BuildFreeformPlanningPromptFromDocsInput,
} from "@planning-review/application/freeform-doc-actions.ts";
import type { AppContext } from "@work-management/domain/work-item.ts";

export type TechnicalPlanningCycleSource = "freeform_docs" | "guided_acp" | "continuous_update";

export interface TechnicalPlanningContextDoc {
  id: string;
  title: string;
  breadcrumb: string;
  bodyMd: string;
  truncated: boolean;
  versionId?: string;
  updatedAt?: string;
}

export interface TechnicalPlanningContext {
  traceId?: string;
  sourceRefs: Array<{ kind: "doc"; id: string }>;
  selectedDocs: TechnicalPlanningContextDoc[];
  contextMarkdown: string;
}

export interface TechnicalPlanningTaskSeed {
  clientKey: string;
  title: string;
  dependsOn?: string[];
  success?: string;
}

export interface TechnicalPlanningResearchQuestion {
  id?: string;
  question: string;
  limit: string;
  conclusion?: string;
  sourceIds?: string[];
}

export interface TechnicalPlanningResearchArtifact {
  id: string;
  question: string;
  limit: string;
  conclusion: string;
  sourceIds: string[];
  status: "recorded" | "assumption_recorded";
}

export interface BuildTechnicalPlanningCycleDraftInput {
  source: TechnicalPlanningCycleSource;
  userPrompt: string;
  context: TechnicalPlanningContext;
  planId?: string;
  reviewId?: string;
  projectId?: string | null;
  traceId?: string;
  prototypePaths?: string[];
  boilerplatePaths?: string[];
  successCriteria?: string[];
  taskSeeds?: TechnicalPlanningTaskSeed[];
  researchQuestions?: TechnicalPlanningResearchQuestion[];
}

export interface GenerateTechnicalPlanningCycleInput
  extends Omit<BuildTechnicalPlanningCycleDraftInput, "context">,
    BuildFreeformPlanningPromptFromDocsInput {
  projectId?: string | null;
}

export interface TechnicalPlanningCyclePlan {
  planId: string;
  reviewId?: string;
  title: string;
  traceId?: string;
  source: TechnicalPlanningCycleSource;
  markdown: string;
  prototypePaths: string[];
  boilerplatePaths: string[];
  sourceDocRefs: Array<{ kind: "doc"; id: string }>;
  researchArtifactIds?: string[];
}

export interface TechnicalPlanningCycleDraft {
  status: "ready_for_plan_review";
  context: TechnicalPlanningContext;
  prompt: string;
  reviewPrompt: string;
  plan: TechnicalPlanningCyclePlan;
  researchArtifacts?: TechnicalPlanningResearchArtifact[];
  artifactPreviews: PlanningArtifactPreview[];
  breakdown: ApprovedPlanBreakdown;
}

export interface GeneratedTechnicalPlanningCycle extends TechnicalPlanningCycleDraft {
  eventId: string;
}

const DEFAULT_PROTOTYPE_PATHS = ["apps/web/src/routes/planning/workbench-prototype.tsx"];
const DEFAULT_BOILERPLATE_PATHS = ["services/planning-review/src/application/technical-planning-cycle.ts"];

const DEFAULT_SUCCESS_CRITERIA = [
  "User can review a generated technical plan before task creation.",
  "Prototype and boilerplate artifacts are visible before approval.",
  "Every generated task has success criteria and trace metadata.",
  "Dependency execution can be previewed before any run is dispatched.",
];

const DEFAULT_TASK_SEEDS: TechnicalPlanningTaskSeed[] = [
  {
    clientKey: "T1",
    title: "Assemble planning context",
    success: "Selected freeform docs and ACP metadata are visible in the review prompt.",
  },
  {
    clientKey: "T2",
    title: "Prepare reviewable prototype artifacts",
    dependsOn: ["T1"],
    success: "Prototype and boilerplate paths are attached to the generated plan.",
  },
  {
    clientKey: "T3",
    title: "Prepare execution-ready work breakdown",
    dependsOn: ["T2"],
    success: "Generated work items include dependencies and success criteria.",
  },
];

export function buildTechnicalPlanningCycleDraft(
  input: BuildTechnicalPlanningCycleDraftInput,
): TechnicalPlanningCycleDraft {
  const traceId = input.traceId ?? input.context.traceId;
  const planId = input.planId ?? stableId("technical-plan", input.userPrompt, traceId);
  const title = titleFromPrompt(input.userPrompt);
  const prototypePaths = normalizePaths(input.prototypePaths, DEFAULT_PROTOTYPE_PATHS);
  const boilerplatePaths = normalizePaths(input.boilerplatePaths, DEFAULT_BOILERPLATE_PATHS);
  const successCriteria = normalizeTextList(input.successCriteria, DEFAULT_SUCCESS_CRITERIA);
  const taskSeeds = normalizeTaskSeeds(input.taskSeeds);
  const researchArtifacts = buildResearchArtifacts(input.researchQuestions);
  const markdown = buildPlanMarkdown({
    title,
    input,
    traceId,
    prototypePaths,
    boilerplatePaths,
    successCriteria,
    taskSeeds,
    researchArtifacts,
  });
  const breakdown = buildApprovedPlanBreakdown({
    planId,
    reviewId: input.reviewId,
    traceId,
    projectId: input.projectId,
    approvedPlanMarkdown: markdown,
    sourceDocRefs: input.context.sourceRefs,
  });
  const artifactPreviews = buildPlanningArtifactPreviews({ artifacts: breakdown.artifacts });

  return {
    status: "ready_for_plan_review",
    context: input.context,
    prompt: buildGenerationPrompt(input, traceId),
    reviewPrompt: buildReviewPrompt({ traceId, source: input.source, markdown, breakdown }),
    plan: {
      planId,
      reviewId: input.reviewId,
      title,
      traceId,
      source: input.source,
      markdown,
      prototypePaths,
      boilerplatePaths,
      sourceDocRefs: [...input.context.sourceRefs],
      researchArtifactIds: researchArtifacts.map((artifact) => artifact.id),
    },
    researchArtifacts,
    artifactPreviews,
    breakdown,
  };
}

export async function generateTechnicalPlanningCycle(
  em: EntityManager,
  ctx: AppContext,
  input: GenerateTechnicalPlanningCycleInput,
): Promise<GeneratedTechnicalPlanningCycle> {
  const projectId = input.projectId ?? ctx.projectId ?? null;
  const planning = await buildFreeformPlanningPromptFromDocs(em, { ...ctx, projectId }, {
    userPrompt: input.userPrompt,
    selectedDocIds: input.selectedDocIds,
    traceId: input.traceId,
    maxDocChars: input.maxDocChars,
  });
  const draft = buildTechnicalPlanningCycleDraft({
    ...input,
    projectId,
    context: planning.context,
  });
  const event = await appendEventOrm(em, {
    orgId: ctx.orgId,
    projectId,
    actor: "system",
    subjectKind: "plan",
    subjectId: draft.plan.planId,
    verb: "technical_planning_generated",
    payload: {
      traceId: draft.plan.traceId,
      planId: draft.plan.planId,
      reviewId: draft.plan.reviewId,
      source: draft.plan.source,
      sourceRefs: draft.plan.sourceDocRefs,
      prototypePaths: draft.plan.prototypePaths,
      boilerplatePaths: draft.plan.boilerplatePaths,
      artifactPreviewIds: draft.artifactPreviews.map((preview) => preview.id),
      researchArtifactIds: (draft.researchArtifacts ?? []).map((artifact) => artifact.id),
      taskClientKeys: draft.breakdown.taskDrafts.map((task) => task.clientKey),
    },
  });

  return {
    ...draft,
    prompt: planning.prompt,
    eventId: event.id,
  };
}

function buildPlanMarkdown(input: {
  title: string;
  input: BuildTechnicalPlanningCycleDraftInput;
  traceId?: string;
  prototypePaths: string[];
  boilerplatePaths: string[];
  successCriteria: string[];
  taskSeeds: TechnicalPlanningTaskSeed[];
  researchArtifacts: TechnicalPlanningResearchArtifact[];
}): string {
  const lines = [
    `# ${input.title}`,
    "",
    "## Context",
    `- Source: ${sourceLabel(input.input.source)}`,
    input.traceId ? `- Trace ID: ${input.traceId}` : null,
    ...input.input.context.sourceRefs.map((ref) => `- Source doc: ${ref.id}`),
    "",
    input.input.context.contextMarkdown,
    "",
    "## Bounded Research",
    ...researchArtifactLines(input.researchArtifacts),
    "",
    "## Decision Inputs",
    input.researchArtifacts.length > 0
      ? `- Cite research artifacts before plan decisions: ${input.researchArtifacts.map((artifact) => artifact.id).join(", ")}`
      : "- No research artifacts requested. Record assumptions before approval if decisions need external facts.",
    "",
    "## Prototype / Boilerplate",
    ...artifactLines("prototype", input.prototypePaths),
    ...artifactLines("boilerplate", input.boilerplatePaths),
    "",
    "## Success Criteria",
    ...input.successCriteria.map((criterion) => `- ${criterion}`),
    "",
    "## Tasks",
    ...input.taskSeeds.flatMap(taskLines),
    "",
  ].filter((line): line is string => line !== null);
  return lines.join("\n");
}

function artifactLines(kind: ApprovedPlanArtifactKind, paths: string[]): string[] {
  return paths.map((path) => `- [${kind}] ${path}`);
}

function researchArtifactLines(artifacts: TechnicalPlanningResearchArtifact[]): string[] {
  if (artifacts.length === 0) return ["- No bounded research requested."];
  return artifacts.flatMap((artifact) => [
    `- [research] ${artifact.id}`,
    `  Question: ${artifact.question}`,
    `  Limit: ${artifact.limit}`,
    `  Status: ${artifact.status}`,
    `  Conclusion: ${artifact.conclusion}`,
    `  Sources: ${artifact.sourceIds.length ? artifact.sourceIds.join(", ") : "assumption"}`,
  ]);
}

function taskLines(seed: TechnicalPlanningTaskSeed): string[] {
  return [
    `- [${seed.clientKey}] ${seed.title}`,
    `  Depends on: ${seed.dependsOn?.length ? seed.dependsOn.join(", ") : "none"}`,
    `  Success: ${seed.success ?? `${seed.title} is reviewable and trace-linked.`}`,
  ];
}

function buildGenerationPrompt(input: BuildTechnicalPlanningCycleDraftInput, traceId?: string): string {
  const researchLines = buildResearchArtifacts(input.researchQuestions).flatMap((artifact) => [
    `Research artifact ${artifact.id}: ${artifact.question}`,
    `Limit: ${artifact.limit}`,
    `Conclusion: ${artifact.conclusion}`,
  ]);
  return [
    input.userPrompt.trim(),
    "",
    "Generate a technical plan with prototype and boilerplate artifacts before task execution.",
    "Persist bounded research conclusions as artifact ids before making implementation decisions.",
    traceId ? `Trace ID: ${traceId}` : null,
    ...researchLines,
    input.context.contextMarkdown,
  ].filter((line): line is string => line !== null).join("\n");
}

function buildReviewPrompt(input: {
  traceId?: string;
  source: TechnicalPlanningCycleSource;
  markdown: string;
  breakdown: ApprovedPlanBreakdown;
}): string {
  return [
    "Review this generated technical plan before materializing tasks.",
    `Source: ${sourceLabel(input.source)}`,
    input.traceId ? `Trace ID: ${input.traceId}` : null,
    `Artifacts: ${input.breakdown.artifacts.length}`,
    `Tasks: ${input.breakdown.taskDrafts.length}`,
    "",
    input.markdown,
  ].filter((line): line is string => line !== null).join("\n");
}

function buildResearchArtifacts(questions?: TechnicalPlanningResearchQuestion[]): TechnicalPlanningResearchArtifact[] {
  return normalizeResearchQuestions(questions).map((item, index) => {
    const id = item.id ?? stableId(`research-${index + 1}`, item.question, item.limit);
    const sourceIds = normalizeTextList(item.sourceIds, []);
    const conclusion = item.conclusion?.trim() ||
      `Assumption recorded because no research provider is configured for: ${item.question}`;
    return {
      id,
      question: item.question,
      limit: item.limit,
      conclusion,
      sourceIds,
      status: item.conclusion?.trim() ? "recorded" : "assumption_recorded",
    };
  });
}

function normalizeResearchQuestions(questions?: TechnicalPlanningResearchQuestion[]): TechnicalPlanningResearchQuestion[] {
  return (questions ?? [])
    .map((question) => ({
      id: question.id?.trim() || undefined,
      question: question.question.trim(),
      limit: question.limit.trim(),
      conclusion: question.conclusion?.trim() || undefined,
      sourceIds: normalizeTextList(question.sourceIds, []),
    }))
    .filter((question) => question.question.length > 0 && question.limit.length > 0);
}

function normalizeTaskSeeds(seeds?: TechnicalPlanningTaskSeed[]): TechnicalPlanningTaskSeed[] {
  const source = seeds?.length ? seeds : DEFAULT_TASK_SEEDS;
  return source
    .map((seed) => ({
      clientKey: seed.clientKey.trim(),
      title: seed.title.trim(),
      dependsOn: normalizeTextList(seed.dependsOn, []),
      success: seed.success?.trim() || undefined,
    }))
    .filter((seed) => seed.clientKey.length > 0 && seed.title.length > 0);
}

function normalizePaths(paths: string[] | undefined, fallback: string[]): string[] {
  return normalizeTextList(paths, fallback);
}

function normalizeTextList(values: string[] | undefined, fallback: string[]): string[] {
  const normalized = (values?.length ? values : fallback)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(normalized)];
}

function titleFromPrompt(prompt: string): string {
  const firstLine = prompt.trim().split(/\r?\n/, 1)[0]?.replace(/[.?!:]+$/g, "").trim();
  if (!firstLine) return "Generated technical workflow";
  const compact = firstLine.length > 80 ? `${firstLine.slice(0, 77).trim()}...` : firstLine;
  return compact.charAt(0).toUpperCase() + compact.slice(1);
}

function stableId(prefix: string, prompt: string, traceId?: string): string {
  const raw = `${traceId ?? ""}:${prompt}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `${prefix}-${hash.toString(16)}`;
}

function sourceLabel(source: TechnicalPlanningCycleSource): string {
  return source.replace(/_/g, " ");
}
