import { makeId, type Run } from "@fulcrum/shared";
import type { RunRepositoryPort } from "./service.js";
import type { QualityGateRepositoryPort } from "../quality/runner.js";

export class RunQualityLinker {
  constructor(
    private readonly runs: Pick<RunRepositoryPort, "get" | "save" | "appendEvent">,
    private readonly quality: Pick<QualityGateRepositoryPort, "getResult">
  ) {}

  linkResultToRun(runId: string, qualityGateResultId: string): Run {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }
    const result = this.quality.getResult(qualityGateResultId);
    if (!result) {
      throw new Error(`Quality gate result not found: ${qualityGateResultId}`);
    }
    if (result.runId && result.runId !== runId) {
      throw new Error(`Quality gate result belongs to another run: ${result.runId}`);
    }
    const qualityGateIds = [...new Set([...run.qualityGateIds, qualityGateResultId])];
    const artifactIds = result.outputArtifactId
      ? [...new Set([...run.artifactIds, result.outputArtifactId])]
      : run.artifactIds;
    const updated = this.runs.save({
      ...run,
      qualityGateIds,
      artifactIds,
      updatedAt: new Date().toISOString()
    });
    this.runs.appendEvent({
      eventId: makeId("evt", `quality-link-${qualityGateResultId}-${Date.now()}`),
      timestamp: new Date().toISOString(),
      source: "core.runs.quality-links",
      severity: result.status === "passed" ? "info" : "warn",
      type: "quality.completed",
      projectId: run.projectId,
      taskId: run.taskId,
      runId: run.runId,
      payloadSummary: {
        message: `Quality result linked: ${result.status}`,
        qualityGateResultId,
        gateId: result.gateId
      },
      payloadRef: null,
      artifactRefs: result.outputArtifactId ? [result.outputArtifactId] : [],
      policyDecisionRefs: [],
      redactionStatus: result.redactionStatus,
      degraded: [],
      schemaVersion: run.schemaVersion
    });
    return updated;
  }
}
