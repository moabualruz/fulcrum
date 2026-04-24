import {
  ContextItemSchema,
  ContextPackSchema,
  makeId,
  SCHEMA_VERSION,
  type ContextItem,
  type ContextPack,
  type Project,
  type Task
} from "@fulcrum/shared";
import { estimateBudget, rankContextItems } from "./ranking.js";

type SourceRef = ContextItem["sourceRef"];

export interface ContextPackRepositoryPort {
  savePack(pack: ContextPack): ContextPack;
  saveItems(items: ContextItem[]): ContextItem[];
  getPack(contextPackId: string): ContextPack | undefined;
  listItems(contextPackId: string): ContextItem[];
}

export interface ContextBuildInput {
  taskId: string;
  runId?: string;
  budget?: number;
  lanes?: string[];
  offline?: boolean;
  memoryAvailable?: boolean;
  codeAvailable?: boolean;
  now?: string;
}

export interface ContextBuildResult {
  pack: ContextPack;
  items: ContextItem[];
}

export interface ContextTaskPort {
  get(taskId: string): Task | undefined;
}

export interface ContextProjectPort {
  get(projectId: string): Project | undefined;
}

export class ContextPackBuilder {
  constructor(
    private readonly repository: ContextPackRepositoryPort,
    private readonly tasks: ContextTaskPort,
    private readonly projects: ContextProjectPort
  ) {}

  build(input: ContextBuildInput): ContextBuildResult {
    const task = this.tasks.get(input.taskId);
    if (!task) throw new Error(`Task not found: ${input.taskId}`);
    const project = this.projects.get(task.projectId);
    if (!project) throw new Error(`Project not found: ${task.projectId}`);

    const now = input.now ?? new Date().toISOString();
    const budget = input.budget ?? 8000;
    const requestedLanes = new Set(input.lanes ?? ["task", "memory", "code", "policy"]);
    const degradedLanes: ContextPack["degradedLanes"] = [];
    const candidates: ContextItem[] = [];

    if (requestedLanes.has("task")) {
      candidates.push(
        makeItem({
          contextPackId: "ctx_pending",
          lane: "task",
          evidenceType: "task",
          title: task.title,
          text: task.descriptionSnapshot ?? task.title,
          sourceRef: { type: "task", uri: `fulcrum://tasks/${task.taskId}`, label: task.title },
          inclusionReason: "Primary task details define requested work.",
          now,
          linkedRefs: [{ type: "project", uri: `fulcrum://projects/${project.projectId}` }]
        })
      );
    }

    if (requestedLanes.has("memory")) {
      if (input.memoryAvailable === false) {
        degradedLanes.push({
          lane: "memory",
          cause: "Memory backend unavailable during offline context build.",
          fallback: "Task description used as local fallback evidence."
        });
      } else {
        candidates.push(
          makeItem({
            contextPackId: "ctx_pending",
            lane: "memory",
            evidenceType: "memory",
            title: `Memory for ${task.title}`,
            text: task.descriptionSnapshot ?? task.title,
            sourceRef: {
              type: "memory",
              uri: `fulcrum://memory/local/${task.taskId}`,
              label: "local memory fallback"
            },
            inclusionReason: "Local memory lane matched task title and description.",
            limitation: "Uses local task-linked memory fallback until memory adapters land.",
            confidence: 0.6,
            now
          })
        );
      }
    }

    if (requestedLanes.has("code")) {
      if (input.codeAvailable === false) {
        degradedLanes.push({
          lane: "code",
          cause: "Code evidence backend unavailable.",
          fallback: "Project path evidence included."
        });
      }
      candidates.push(
        makeItem({
          contextPackId: "ctx_pending",
          lane: "code",
          evidenceType: input.codeAvailable === false ? "path" : "exact_code",
          title: project.rootPath,
          text: project.rootPath,
          sourceRef: { type: "path", uri: project.rootPath, label: project.name },
          inclusionReason: "Project root anchors code evidence for this task.",
          limitation:
            input.codeAvailable === false
              ? "Exact code search unavailable; path evidence only."
              : undefined,
          confidence: input.codeAvailable === false ? 0.45 : 0.8,
          now
        })
      );
    }

    if (requestedLanes.has("policy")) {
      candidates.push(
        makeItem({
          contextPackId: "ctx_pending",
          lane: "policy",
          evidenceType: "policy",
          title: "Local-only policy constraints",
          text: project.privacyMode,
          sourceRef: {
            type: "policy",
            uri: `fulcrum://projects/${project.projectId}/privacy`,
            label: project.privacyMode
          },
          inclusionReason: "Context must carry privacy and policy constraints.",
          now
        })
      );
    }

    const ranked = rankContextItems(candidates);
    const { included, omissions, budgetUsed } = allocateBudget(ranked, budget);
    const packId = makeId("ctx", `${task.taskId}-${now}`);
    const items = included.map((item) =>
      ContextItemSchema.parse({
        ...item,
        contextPackId: packId,
        contextItemId: makeId("ctxi", `${packId}-${item.lane}-${item.rank}-${item.title}`)
      })
    );
    const pack = ContextPackSchema.parse({
      contextPackId: packId,
      projectId: project.projectId,
      taskId: task.taskId,
      runId: input.runId,
      status: degradedLanes.length > 0 ? "degraded" : "ready",
      generatedAt: now,
      budget,
      budgetUsed,
      laneSummaries: summarizeLanes(items, budget, requestedLanes),
      omissions,
      degradedLanes,
      freshness: now,
      exportRefs: [],
      policyDecisionIds: [],
      redactionStatus: "not_redacted",
      createdAt: now,
      updatedAt: now,
      schemaVersion: SCHEMA_VERSION
    });

    this.repository.savePack(pack);
    this.repository.saveItems(items);
    return { pack, items };
  }

  get(contextPackId: string): ContextBuildResult | undefined {
    const pack = this.repository.getPack(contextPackId);
    return pack ? { pack, items: this.repository.listItems(contextPackId) } : undefined;
  }
}

function makeItem(input: {
  contextPackId: string;
  lane: string;
  evidenceType: ContextItem["evidenceType"];
  title: string;
  text: string;
  sourceRef: SourceRef;
  inclusionReason: string;
  limitation?: string;
  confidence?: number;
  now: string;
  linkedRefs?: SourceRef[];
}): ContextItem {
  return ContextItemSchema.parse({
    contextItemId: makeId("ctxi", `${input.contextPackId}-${input.lane}-${input.title}`),
    contextPackId: input.contextPackId,
    lane: input.lane,
    type: "evidence",
    sourceRef: input.sourceRef,
    title: input.title,
    excerptRef: input.text,
    inclusionReason: input.inclusionReason,
    freshness: input.now,
    evidenceType: input.evidenceType,
    confidence: input.confidence,
    limitation: input.limitation,
    toolIdentity: "fulcrum-context-builder",
    budgetEstimate: estimateBudget(input.text),
    rank: 0,
    redactionStatus: "not_redacted",
    linkedRefs: input.linkedRefs ?? [],
    createdAt: input.now,
    updatedAt: input.now,
    schemaVersion: SCHEMA_VERSION
  });
}

function allocateBudget(items: ContextItem[], budget: number) {
  const laneLimit = Math.max(
    1,
    Math.floor(budget / Math.max(1, new Set(items.map((i) => i.lane)).size))
  );
  const laneUsed = new Map<string, number>();
  const included: ContextItem[] = [];
  const omissions: ContextPack["omissions"] = [];
  let budgetUsed = 0;

  for (const item of items) {
    const used = laneUsed.get(item.lane) ?? 0;
    if (budgetUsed + item.budgetEstimate > budget || used + item.budgetEstimate > laneLimit) {
      omissions.push({
        lane: item.lane,
        reason: "Omitted by lane or total context budget.",
        omittedRef: item.sourceRef
      });
      continue;
    }
    included.push(item);
    laneUsed.set(item.lane, used + item.budgetEstimate);
    budgetUsed += item.budgetEstimate;
  }

  return { included, omissions, budgetUsed };
}

function summarizeLanes(
  items: ContextItem[],
  budget: number,
  requestedLanes: Set<string>
): ContextPack["laneSummaries"] {
  const laneLimit = Math.max(1, Math.floor(budget / Math.max(1, requestedLanes.size)));
  return [...requestedLanes].map((lane) => {
    const laneItems = items.filter((item) => item.lane === lane);
    return {
      lane,
      included: laneItems.length,
      budgetUsed: laneItems.reduce((sum, item) => sum + item.budgetEstimate, 0),
      budgetLimit: laneLimit
    };
  });
}
