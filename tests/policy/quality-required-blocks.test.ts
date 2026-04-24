import { describe, expect, it } from "vitest";
import { QualityReadinessEvaluator } from "@fulcrum/core";
import type { QualityGateDefinition, QualityGateResult } from "@fulcrum/shared";

const now = new Date(0).toISOString();

class MemoryQualityRepository {
  constructor(
    private readonly definitions: QualityGateDefinition[],
    private readonly results: QualityGateResult[]
  ) {}
  saveDefinition(definition: QualityGateDefinition) {
    return definition;
  }
  getDefinition() {
    return undefined;
  }
  listDefinitions(projectId: string) {
    return this.definitions.filter((definition) => definition.projectId === projectId);
  }
  saveResult(result: QualityGateResult) {
    return result;
  }
  getResult() {
    return undefined;
  }
  listResults(input: { projectId: string; runId?: string }) {
    return this.results.filter(
      (result) =>
        result.projectId === input.projectId && (!input.runId || result.runId === input.runId)
    );
  }
}

describe("quality required gate readiness", () => {
  it("blocks readiness until required gate has passing evidence", () => {
    const gate: QualityGateDefinition = {
      gateId: "gate_required",
      projectId: "proj_01",
      name: "required",
      command: "pnpm test",
      required: true,
      createdAt: now,
      updatedAt: now,
      schemaVersion: "1.0"
    };
    const failing: QualityGateResult = {
      qualityGateResultId: "gate_result_fail",
      gateId: gate.gateId,
      projectId: gate.projectId,
      runId: "run_01",
      status: "failed",
      parsedSummary: { exitCode: 1, stdoutLines: 0, stderrLines: 1, timedOut: false },
      redactionStatus: "not_applicable",
      createdAt: now,
      updatedAt: now,
      schemaVersion: "1.0"
    };
    const blocked = new QualityReadinessEvaluator(
      new MemoryQualityRepository([gate], [failing])
    ).evaluate({ projectId: "proj_01", runId: "run_01" });
    const excepted = new QualityReadinessEvaluator(
      new MemoryQualityRepository([gate], [failing])
    ).evaluate({
      projectId: "proj_01",
      runId: "run_01",
      exceptions: { [gate.gateId]: "operator release exception" }
    });

    expect(blocked.status).toBe("blocked");
    expect(blocked.blockingGateIds).toEqual([gate.gateId]);
    expect(excepted.status).toBe("exception");
  });
});
