import type {
  ArtifactContract,
  CodeEvidence,
  GraphLink,
  GraphNodeType,
  MemoryEntry,
  PolicyDecision,
  QualityGateResult,
  Run,
  SourceRef
} from "@fulcrum/shared";
import type { GraphLinkService } from "./service.js";
import type { ContextBuildResult } from "../context/builder.js";

export class GraphLinkWriters {
  constructor(private readonly graph: GraphLinkService) {}

  context(result: ContextBuildResult): GraphLink[] {
    const links: GraphLink[] = [
      this.graph.link({
        projectId: result.pack.projectId,
        sourceType: "context_pack",
        sourceId: result.pack.contextPackId,
        targetType: "task",
        targetId: result.pack.taskId,
        relation: "explains",
        sourceRef: ref("context-pack", result.pack.contextPackId),
        targetRef: ref("task", result.pack.taskId),
        reason: "Context pack explains task inputs.",
        freshness: "fresh",
        derived: false,
        redactionStatus: result.pack.redactionStatus
      })
    ];
    for (const item of result.items) {
      const itemRef = ref("context-item", item.contextItemId, item.title);
      links.push(
        this.graph.link({
          projectId: result.pack.projectId,
          sourceType: "context_pack",
          sourceId: result.pack.contextPackId,
          targetType: "context_item",
          targetId: item.contextItemId,
          relation: "produced",
          sourceRef: ref("context-pack", result.pack.contextPackId),
          targetRef: item.sourceRef,
          reason: item.inclusionReason,
          freshness: item.limitation?.toLowerCase().includes("stale") ? "stale" : "fresh",
          limitation: item.limitation,
          confidence: item.confidence,
          derived: false,
          redactionStatus: item.redactionStatus
        })
      );
      for (const sourceRef of [item.sourceRef, ...item.linkedRefs]) {
        const target = sourceNode(sourceRef);
        if (!target) continue;
        links.push(
          this.graph.link({
            projectId: result.pack.projectId,
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
            derived: false,
            redactionStatus: item.redactionStatus
          })
        );
      }
    }
    return links;
  }

  memory(entry: MemoryEntry): GraphLink[] {
    const links: GraphLink[] = [];
    const freshness = memoryFreshness(entry);
    for (const taskId of entry.linkedTaskIds) {
      links.push(
        this.graph.link({
          projectId: entry.projectId,
          sourceType: "memory",
          sourceId: entry.memoryId,
          targetType: "task",
          targetId: taskId,
          relation: "references",
          sourceRef: ref("memory", entry.memoryId, entry.title),
          targetRef: ref("task", taskId),
          evidenceRef: entry.sourceRefs[0],
          reason: "Memory entry links task.",
          ...freshness,
          derived: false,
          redactionStatus: entry.redactionStatus
        })
      );
    }
    for (const runId of entry.linkedRunIds) {
      links.push(
        this.graph.link({
          projectId: entry.projectId,
          sourceType: "memory",
          sourceId: entry.memoryId,
          targetType: "run",
          targetId: runId,
          relation: "references",
          sourceRef: ref("memory", entry.memoryId, entry.title),
          targetRef: ref("run", runId),
          evidenceRef: entry.sourceRefs[0],
          reason: "Memory entry links run.",
          ...freshness,
          derived: false,
          redactionStatus: entry.redactionStatus
        })
      );
    }
    for (const artifactId of entry.linkedArtifactIds) {
      links.push(
        this.graph.link({
          projectId: entry.projectId,
          sourceType: "memory",
          sourceId: entry.memoryId,
          targetType: "artifact",
          targetId: artifactId,
          relation: "references",
          sourceRef: ref("memory", entry.memoryId, entry.title),
          targetRef: ref("artifact", artifactId),
          evidenceRef: entry.sourceRefs[0],
          reason: "Memory entry links artifact.",
          ...freshness,
          derived: false,
          redactionStatus: entry.redactionStatus
        })
      );
    }
    for (const sourceRef of [...entry.linkedFileRefs, ...entry.linkedSymbolRefs]) {
      links.push(
        this.graph.link({
          projectId: entry.projectId,
          sourceType: "memory",
          sourceId: entry.memoryId,
          targetType: "code",
          targetId: sourceRef.uri,
          relation: "references",
          sourceRef: ref("memory", entry.memoryId, entry.title),
          targetRef: sourceRef,
          evidenceRef: sourceRef,
          reason: "Memory entry cites code source.",
          ...freshness,
          derived: false,
          redactionStatus: entry.redactionStatus
        })
      );
    }
    return links;
  }

  code(evidence: CodeEvidence, contextItemIds = evidence.linkedContextItemIds): GraphLink[] {
    if (contextItemIds.length === 0) {
      return [
        this.graph.link({
          projectId: evidence.projectId,
          sourceType: "code",
          sourceId: evidence.evidenceId,
          targetType: "project",
          targetId: evidence.projectId,
          relation: "references",
          sourceRef: codeRef(evidence),
          targetRef: ref("project", evidence.projectId),
          reason: evidence.reason,
          freshness: evidence.staleAt ? "stale" : "fresh",
          limitation: evidence.staleAt ? "Code evidence source is stale." : undefined,
          derived: false,
          redactionStatus: "not_applicable"
        })
      ];
    }
    return contextItemIds.map((contextItemId) =>
      this.graph.link({
        projectId: evidence.projectId,
        sourceType: "code",
        sourceId: evidence.evidenceId,
        targetType: "context_item",
        targetId: contextItemId,
        relation: "used",
        sourceRef: {
          type: "file",
          uri: evidence.filePath,
          label: evidence.symbol ?? evidence.query,
          lineStart: evidence.lineStart,
          lineEnd: evidence.lineEnd
        },
        targetRef: ref("context-item", contextItemId),
        reason: evidence.reason,
        freshness: evidence.staleAt ? "stale" : "fresh",
        limitation: evidence.staleAt ? "Code evidence source is stale." : undefined,
        derived: false,
        redactionStatus: "not_applicable"
      })
    );
  }

  run(run: Run): GraphLink[] {
    const links: GraphLink[] = [
      this.graph.link({
        projectId: run.projectId,
        sourceType: "run",
        sourceId: run.runId,
        targetType: "task",
        targetId: run.taskId,
        relation: "affected",
        sourceRef: ref("run", run.runId, run.status),
        targetRef: ref("task", run.taskId),
        reason: "Run executed for task.",
        freshness: "fresh",
        derived: false,
        redactionStatus: run.redactionStatus
      })
    ];
    if (run.contextPackId) {
      const contextPackId = run.contextPackId;
      links.push(
        this.graph.link({
          projectId: run.projectId,
          sourceType: "run",
          sourceId: run.runId,
          targetType: "context_pack",
          targetId: contextPackId,
          relation: "used",
          sourceRef: ref("run", run.runId),
          targetRef: ref("context-pack", contextPackId),
          reason: "Run used context pack.",
          freshness: "fresh",
          derived: false,
          redactionStatus: run.redactionStatus
        })
      );
    }
    for (const artifactId of [...run.artifactIds, ...run.logArtifactIds]) {
      links.push(
        this.graph.link({
          projectId: run.projectId,
          sourceType: "run",
          sourceId: run.runId,
          targetType: "artifact",
          targetId: artifactId,
          relation: "produced",
          sourceRef: ref("run", run.runId),
          targetRef: ref("artifact", artifactId),
          reason: "Run captured artifact.",
          freshness: "fresh",
          derived: false,
          redactionStatus: run.redactionStatus
        })
      );
    }
    for (const qualityGateId of run.qualityGateIds) {
      links.push(
        this.graph.link({
          projectId: run.projectId,
          sourceType: "quality_gate",
          sourceId: qualityGateId,
          targetType: "run",
          targetId: run.runId,
          relation: "validated_by",
          sourceRef: ref("quality-gate", qualityGateId),
          targetRef: ref("run", run.runId),
          reason: "Run references quality gate result.",
          freshness: "fresh",
          derived: false,
          redactionStatus: run.redactionStatus
        })
      );
    }
    for (const policyDecisionId of run.policyDecisionIds) {
      links.push(
        this.graph.link({
          projectId: run.projectId,
          sourceType: "run",
          sourceId: run.runId,
          targetType: "policy_decision",
          targetId: policyDecisionId,
          relation: "governed_by",
          sourceRef: ref("run", run.runId),
          targetRef: ref("policy-decision", policyDecisionId),
          reason: "Run references policy decision.",
          freshness: "fresh",
          derived: false,
          redactionStatus: run.redactionStatus
        })
      );
    }
    return links;
  }

  artifact(artifact: ArtifactContract): GraphLink[] {
    const links: GraphLink[] = [];
    if (artifact.runId && artifact.projectId) {
      links.push(
        this.graph.link({
          projectId: artifact.projectId,
          sourceType: "run",
          sourceId: artifact.runId,
          targetType: "artifact",
          targetId: artifact.artifactId,
          relation: "produced",
          sourceRef: ref("run", artifact.runId),
          targetRef: ref("artifact", artifact.artifactId, artifact.summary),
          reason: "Run produced artifact.",
          freshness: "fresh",
          derived: false,
          redactionStatus: artifact.redactionStatus
        })
      );
    }
    if (artifact.taskId && artifact.projectId) {
      links.push(
        this.graph.link({
          projectId: artifact.projectId,
          sourceType: "task",
          sourceId: artifact.taskId,
          targetType: "artifact",
          targetId: artifact.artifactId,
          relation: "produced",
          sourceRef: ref("task", artifact.taskId),
          targetRef: ref("artifact", artifact.artifactId, artifact.summary),
          reason: "Task produced artifact.",
          freshness: "fresh",
          derived: false,
          redactionStatus: artifact.redactionStatus
        })
      );
    }
    if (artifact.projectId) {
      for (const linkedRef of artifact.linkedRefs) {
        const target = sourceNode(linkedRef);
        if (!target) continue;
        links.push(
          this.graph.link({
            projectId: artifact.projectId,
            sourceType: "artifact",
            sourceId: artifact.artifactId,
            targetType: target.type,
            targetId: target.id,
            relation: "references",
            sourceRef: ref("artifact", artifact.artifactId, artifact.summary),
            targetRef: target.ref,
            evidenceRef: linkedRef,
            reason: "Artifact links source evidence.",
            freshness: "fresh",
            derived: false,
            redactionStatus: artifact.redactionStatus
          })
        );
      }
    }
    return links;
  }

  quality(result: QualityGateResult): GraphLink[] {
    const links: GraphLink[] = [];
    if (result.runId) {
      links.push(
        this.graph.link({
          projectId: result.projectId,
          sourceType: "quality_gate",
          sourceId: result.qualityGateResultId,
          targetType: "run",
          targetId: result.runId,
          relation: "validated_by",
          sourceRef: ref("quality-gate", result.qualityGateResultId, result.status),
          targetRef: ref("run", result.runId),
          reason: "Quality gate validates run evidence.",
          freshness: "fresh",
          derived: false,
          redactionStatus: result.redactionStatus
        })
      );
    }
    if (result.outputArtifactId) {
      links.push(
        this.graph.link({
          projectId: result.projectId,
          sourceType: "quality_gate",
          sourceId: result.qualityGateResultId,
          targetType: "artifact",
          targetId: result.outputArtifactId,
          relation: "produced",
          sourceRef: ref("quality-gate", result.qualityGateResultId, result.status),
          targetRef: ref("artifact", result.outputArtifactId),
          reason: "Quality gate produced output artifact.",
          freshness: "fresh",
          derived: false,
          redactionStatus: result.redactionStatus
        })
      );
    }
    return links;
  }

  policy(
    projectId: string,
    subject: { type: "run" | "context_pack"; id: string },
    decision: PolicyDecision
  ): GraphLink {
    return this.graph.link({
      projectId,
      sourceType: subject.type,
      sourceId: subject.id,
      targetType: "policy_decision",
      targetId: decision.policyDecisionId,
      relation: "governed_by",
      sourceRef: ref(subject.type.replace("_", "-"), subject.id),
      targetRef: ref("policy-decision", decision.policyDecisionId, decision.status),
      reason: decision.nextAction ?? decision.reason,
      freshness: "fresh",
      derived: false,
      redactionStatus: "not_applicable"
    });
  }
}

function ref(type: string, id: string, label?: string) {
  return { type, uri: `fulcrum://${type}s/${id}`, label };
}

function codeRef(evidence: CodeEvidence): SourceRef {
  return {
    type: "file",
    uri: evidence.filePath,
    label: evidence.symbol ?? evidence.query,
    lineStart: evidence.lineStart,
    lineEnd: evidence.lineEnd
  };
}

function memoryFreshness(entry: MemoryEntry) {
  return {
    freshness: entry.freshness === "stale" ? "stale" : "fresh",
    limitation: entry.freshness === "stale" ? "Memory source marked stale." : undefined
  } as const;
}

function sourceNode(
  sourceRef: SourceRef
): { type: GraphNodeType; id: string; ref: SourceRef } | undefined {
  const sourceType = sourceRef.type.replace(/-/g, "_");
  if (
    sourceType === "file" ||
    sourceType === "path" ||
    sourceType === "symbol" ||
    sourceType === "code"
  ) {
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
