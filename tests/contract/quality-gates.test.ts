import { describe, expect, it } from "vitest";
import { QualityGateDefinitionSchema, QualityGateResultSchema } from "@fulcrum/shared";

describe("quality gate contracts", () => {
  it("validates gate definitions and result artifacts", () => {
    const definition = QualityGateDefinitionSchema.parse({
      gateId: "gate_lint",
      projectId: "proj_01",
      name: "lint",
      command: "pnpm lint",
      required: true,
      timeoutMs: 1000,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      schemaVersion: "1.0"
    });
    const result = QualityGateResultSchema.parse({
      qualityGateResultId: "gate_result_lint",
      gateId: definition.gateId,
      projectId: definition.projectId,
      runId: "run_01",
      workingDirectory: "/workspace/project",
      status: "passed",
      outputArtifactId: "art_quality",
      parsedSummary: { exitCode: 0, stdoutLines: 1, stderrLines: 0, timedOut: false },
      redactionStatus: "not_applicable",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      schemaVersion: "1.0"
    });

    expect(definition.required).toBe(true);
    expect(result.workingDirectory).toBe("/workspace/project");
    expect(result.outputArtifactId).toBe("art_quality");
  });
});
