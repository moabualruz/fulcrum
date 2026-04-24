import {
  GraphLinkSchema,
  makeId,
  SCHEMA_VERSION,
  type CodeEvidence,
  type ContextItem,
  type ContextPack,
  type GraphLink,
  type GraphNodeType,
  type MemoryEntry,
  type QualityGateResult,
  type Run,
  type SourceRef,
  type Task
} from "@fulcrum/shared";

export interface GraphLinkRepositoryPort {
  save(link: GraphLink): GraphLink;
  list(projectId?: string): GraphLink[];
  listForNode(type: GraphNodeType, id: string): GraphLink[];
  replaceDerived(projectId: string, links: GraphLink[]): GraphLink[];
}

export interface GraphRebuildSources {
  tasks?: Task[];
  memories?: MemoryEntry[];
  codeEvidence?: CodeEvidence[];
  runs?: Run[];
  contextPacks?: ContextPack[];
  contextItems?: ContextItem[];
  qualityResults?: QualityGateResult[];
}

export class GraphLinkService {
  constructor(private readonly repository: GraphLinkRepositoryPort) {}

  link(
    input: Omit<GraphLink, "graphLinkId" | "createdAt" | "updatedAt" | "schemaVersion">
  ): GraphLink {
    const now = new Date().toISOString();
    return this.repository.save(
      GraphLinkSchema.parse({
        ...input,
        graphLinkId: makeId(
          "gl",
          `${input.projectId}:${input.sourceType}:${input.sourceId}:${input.relation}:${input.targetType}:${input.targetId}`
        ),
        createdAt: now,
        updatedAt: now,
        schemaVersion: SCHEMA_VERSION
      })
    );
  }

  list(projectId?: string): GraphLink[] {
    return this.repository.list(projectId);
  }

  forNode(type: GraphNodeType, id: string): GraphLink[] {
    return this.repository.listForNode(type, id);
  }

  rebuild(projectId: string, sources: GraphRebuildSources): GraphLink[] {
    const links = rebuildGraphLinks(projectId, sources);
    return this.repository.replaceDerived(projectId, links);
  }
}

export function rebuildGraphLinks(projectId: string, sources: GraphRebuildSources): GraphLink[] {
  const now = new Date().toISOString();
  const links: GraphLink[] = [];
  const seen = new Set<string>();
  const push = (
    input: Omit<GraphLink, "graphLinkId" | "createdAt" | "updatedAt" | "schemaVersion">
  ) => {
    const graphLinkId = makeGraphLinkId(input);
    if (seen.has(graphLinkId)) return;
    seen.add(graphLinkId);
    links.push(
      GraphLinkSchema.parse({
        ...input,
        graphLinkId,
        createdAt: now,
        updatedAt: now,
        schemaVersion: SCHEMA_VERSION
      })
    );
  };

  for (const task of sources.tasks ?? []) {
    if (task.projectId !== projectId) continue;
    push({
      projectId,
      sourceType: "task",
      sourceId: task.taskId,
      targetType: "project",
      targetId: projectId,
      relation: "depends_on",
      sourceRef: ref("task", task.taskId, task.title),
      targetRef: ref("project", projectId),
      reason: "Task belongs to project.",
      freshness: "fresh",
      derived: true,
      redactionStatus: "not_applicable"
    });
  }

  for (const memory of sources.memories ?? []) {
    if (memory.projectId !== projectId) continue;
    const freshness = memoryFreshness(memory);
    for (const taskId of memory.linkedTaskIds) {
      push({
        projectId,
        sourceType: "memory",
        sourceId: memory.memoryId,
        targetType: "task",
        targetId: taskId,
        relation: "references",
        sourceRef: ref("memory", memory.memoryId, memory.title),
        targetRef: ref("task", taskId),
        evidenceRef: memory.sourceRefs[0],
        reason: "Memory entry declares linked task.",
        ...freshness,
        derived: true,
        redactionStatus: memory.redactionStatus
      });
    }
    for (const runId of memory.linkedRunIds) {
      push({
        projectId,
        sourceType: "memory",
        sourceId: memory.memoryId,
        targetType: "run",
        targetId: runId,
        relation: "references",
        sourceRef: ref("memory", memory.memoryId, memory.title),
        targetRef: ref("run", runId),
        evidenceRef: memory.sourceRefs[0],
        reason: "Memory entry declares linked run.",
        ...freshness,
        derived: true,
        redactionStatus: memory.redactionStatus
      });
    }
    for (const artifactId of memory.linkedArtifactIds) {
      push({
        projectId,
        sourceType: "memory",
        sourceId: memory.memoryId,
        targetType: "artifact",
        targetId: artifactId,
        relation: "references",
        sourceRef: ref("memory", memory.memoryId, memory.title),
        targetRef: ref("artifact", artifactId),
        reason: "Memory entry links artifact.",
        evidenceRef: memory.sourceRefs[0],
        ...freshness,
        derived: true,
        redactionStatus: memory.redactionStatus
      });
    }
    for (const sourceRef of [...memory.linkedFileRefs, ...memory.linkedSymbolRefs]) {
      push({
        projectId,
        sourceType: "memory",
        sourceId: memory.memoryId,
        targetType: "code",
        targetId: sourceRef.uri,
        relation: "references",
        sourceRef: ref("memory", memory.memoryId, memory.title),
        targetRef: sourceRef,
        evidenceRef: sourceRef,
        reason: "Memory entry cites code source.",
        ...freshness,
        derived: true,
        redactionStatus: memory.redactionStatus
      });
    }
  }

  for (const evidence of sources.codeEvidence ?? []) {
    if (evidence.projectId !== projectId) continue;
    if (evidence.linkedContextItemIds.length === 0) {
      push({
        projectId,
        sourceType: "code",
        sourceId: evidence.evidenceId,
        targetType: "project",
        targetId: projectId,
        relation: "references",
        sourceRef: codeRef(evidence),
        targetRef: ref("project", projectId),
        reason: evidence.reason,
        freshness: evidence.staleAt ? "stale" : "fresh",
        limitation: evidence.staleAt ? "Code evidence source is stale." : undefined,
        derived: true,
        redactionStatus: "not_applicable"
      });
    }
    for (const contextItemId of evidence.linkedContextItemIds) {
      push({
        projectId,
        sourceType: "code",
        sourceId: evidence.evidenceId,
        targetType: "context_item",
        targetId: contextItemId,
        relation: "used",
        sourceRef: codeRef(evidence),
        targetRef: ref("context-item", contextItemId),
        reason: evidence.reason,
        freshness: evidence.staleAt ? "stale" : "fresh",
        limitation: evidence.staleAt ? "Code evidence source is stale." : undefined,
        derived: true,
        redactionStatus: "not_applicable"
      });
    }
  }

  for (const pack of sources.contextPacks ?? []) {
    if (pack.projectId !== projectId) continue;
    push({
      projectId,
      sourceType: "context_pack",
      sourceId: pack.contextPackId,
      targetType: "task",
      targetId: pack.taskId,
      relation: "explains",
      sourceRef: ref("context-pack", pack.contextPackId),
      targetRef: ref("task", pack.taskId),
      reason: "Context pack was built for task.",
      freshness: "fresh",
      derived: true,
      redactionStatus: pack.redactionStatus
    });
    if (pack.runId) {
      push({
        projectId,
        sourceType: "run",
        sourceId: pack.runId,
        targetType: "context_pack",
        targetId: pack.contextPackId,
        relation: "used",
        sourceRef: ref("run", pack.runId),
        targetRef: ref("context-pack", pack.contextPackId),
        reason: "Run used context pack.",
        freshness: "fresh",
        derived: true,
        redactionStatus: pack.redactionStatus
      });
    }
  }

  for (const item of sources.contextItems ?? []) {
    const pack = (sources.contextPacks ?? []).find(
      (candidate) => candidate.contextPackId === item.contextPackId
    );
    if (!pack || pack.projectId !== projectId) continue;
    const itemRef = ref("context-item", item.contextItemId, item.title);
    push({
      projectId,
      sourceType: "context_pack",
      sourceId: item.contextPackId,
      targetType: "context_item",
      targetId: item.contextItemId,
      relation: "produced",
      sourceRef: ref("context-pack", item.contextPackId),
      targetRef: item.sourceRef,
      reason: item.inclusionReason,
      freshness: item.limitation?.toLowerCase().includes("stale") ? "stale" : "fresh",
      limitation: item.limitation,
      confidence: item.confidence,
      derived: true,
      redactionStatus: item.redactionStatus
    });
    for (const sourceRef of [item.sourceRef, ...item.linkedRefs]) {
      const target = sourceNode(sourceRef);
      if (!target) continue;
      push({
        projectId,
        sourceType: "context_item",
        sourceId: item.contextItemId,
        targetType: target.type,
        targetId: target.id,
        relation: "derived_from",
        sourceRef: itemRef,
        targetRef: target.ref,
        evidenceRef: sourceRef,
        reason: "Context item derives from source reference.",
        freshness: item.limitation?.toLowerCase().includes("stale") ? "stale" : "fresh",
        limitation: item.limitation,
        confidence: item.confidence,
        derived: true,
        redactionStatus: item.redactionStatus
      });
    }
  }

  for (const run of sources.runs ?? []) {
    if (run.projectId !== projectId) continue;
    push({
      projectId,
      sourceType: "run",
      sourceId: run.runId,
      targetType: "task",
      targetId: run.taskId,
      relation: "affected",
      sourceRef: ref("run", run.runId, run.status),
      targetRef: ref("task", run.taskId),
      reason: "Run executed for task.",
      freshness: "fresh",
      derived: true,
      redactionStatus: run.redactionStatus
    });
    if (run.contextPackId) {
      push({
        projectId,
        sourceType: "run",
        sourceId: run.runId,
        targetType: "context_pack",
        targetId: run.contextPackId,
        relation: "used",
        sourceRef: ref("run", run.runId),
        targetRef: ref("context-pack", run.contextPackId),
        reason: "Run used context pack.",
        freshness: "fresh",
        derived: true,
        redactionStatus: run.redactionStatus
      });
    }
    for (const artifactId of [...run.artifactIds, ...run.logArtifactIds]) {
      push({
        projectId,
        sourceType: "run",
        sourceId: run.runId,
        targetType: "artifact",
        targetId: artifactId,
        relation: "produced",
        sourceRef: ref("run", run.runId),
        targetRef: ref("artifact", artifactId),
        reason: "Run captured artifact.",
        freshness: "fresh",
        derived: true,
        redactionStatus: run.redactionStatus
      });
    }
    for (const qualityGateId of run.qualityGateIds) {
      push({
        projectId,
        sourceType: "quality_gate",
        sourceId: qualityGateId,
        targetType: "run",
        targetId: run.runId,
        relation: "validated_by",
        sourceRef: ref("quality-gate", qualityGateId),
        targetRef: ref("run", run.runId),
        reason: "Run references quality gate result.",
        freshness: "fresh",
        derived: true,
        redactionStatus: run.redactionStatus
      });
    }
    for (const policyDecisionId of run.policyDecisionIds) {
      push({
        projectId,
        sourceType: "run",
        sourceId: run.runId,
        targetType: "policy_decision",
        targetId: policyDecisionId,
        relation: "governed_by",
        sourceRef: ref("run", run.runId),
        targetRef: ref("policy-decision", policyDecisionId),
        reason: "Run references policy decision.",
        freshness: "fresh",
        derived: true,
        redactionStatus: run.redactionStatus
      });
    }
  }

  for (const result of sources.qualityResults ?? []) {
    if (result.projectId !== projectId) continue;
    if (result.runId) {
      push({
        projectId,
        sourceType: "quality_gate",
        sourceId: result.qualityGateResultId,
        targetType: "run",
        targetId: result.runId,
        relation: "validated_by",
        sourceRef: ref("quality-gate", result.qualityGateResultId, result.status),
        targetRef: ref("run", result.runId),
        reason: "Quality gate result validates run.",
        freshness: "fresh",
        derived: true,
        redactionStatus: result.redactionStatus
      });
    }
    if (result.outputArtifactId) {
      push({
        projectId,
        sourceType: "quality_gate",
        sourceId: result.qualityGateResultId,
        targetType: "artifact",
        targetId: result.outputArtifactId,
        relation: "produced",
        sourceRef: ref("quality-gate", result.qualityGateResultId, result.status),
        targetRef: ref("artifact", result.outputArtifactId),
        reason: "Quality gate produced output artifact.",
        freshness: "fresh",
        derived: true,
        redactionStatus: result.redactionStatus
      });
    }
  }

  return links;
}

function ref(type: string, id: string, label?: string) {
  return { type, uri: `fulcrum://${type}s/${id}`, label };
}

function codeRef(evidence: CodeEvidence) {
  return {
    type: "file",
    uri: evidence.filePath,
    label: evidence.symbol ?? evidence.query,
    lineStart: evidence.lineStart,
    lineEnd: evidence.lineEnd
  };
}

function makeGraphLinkId(
  input: Omit<GraphLink, "graphLinkId" | "createdAt" | "updatedAt" | "schemaVersion">
): string {
  return makeId(
    "gl",
    `${input.projectId}:${input.sourceType}:${input.sourceId}:${input.relation}:${input.targetType}:${input.targetId}`
  );
}

function memoryFreshness(memory: MemoryEntry) {
  return {
    freshness: memory.freshness === "stale" ? "stale" : "fresh",
    limitation: memory.freshness === "stale" ? "Memory source marked stale." : undefined
  } as const;
}

function sourceNode(sourceRef: SourceRef): { type: GraphNodeType; id: string; ref: SourceRef } | undefined {
  const sourceType = sourceRef.type.replace(/-/g, "_");
  if (sourceType === "file" || sourceType === "path" || sourceType === "symbol" || sourceType === "code") {
    return { type: "code", id: sourceRef.uri, ref: sourceRef };
  }
  const typeMap: Record<string, GraphNodeType> = {
    artifact: "artifact",
    context_item: "context_item",
    context_pack: "context_pack",
    memory: "memory",
    policy_decision: "policy_decision",
    project: "project",
    quality_gate: "quality_gate",
    run: "run",
    task: "task"
  };
  const graphType = typeMap[sourceType];
  if (!graphType) return undefined;
  return { type: graphType, id: lastUriSegment(sourceRef.uri), ref: sourceRef };
}

function lastUriSegment(uri: string): string {
  const trimmed = uri.replace(/\/+$/, "");
  return trimmed.split("/").filter(Boolean).at(-1) ?? trimmed;
}
