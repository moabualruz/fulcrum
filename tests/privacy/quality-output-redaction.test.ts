import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactService, LocalArtifactStorage, QualityGateRunner } from "@fulcrum/core";
import type { ArtifactContract, QualityGateDefinition, QualityGateResult } from "@fulcrum/shared";

class MemoryQualityRepository {
  definitions = new Map<string, QualityGateDefinition>();
  results = new Map<string, QualityGateResult>();
  saveDefinition(definition: QualityGateDefinition) {
    this.definitions.set(definition.gateId, definition);
    return definition;
  }
  getDefinition(gateId: string) {
    return this.definitions.get(gateId);
  }
  listDefinitions(projectId: string) {
    return [...this.definitions.values()].filter(
      (definition) => definition.projectId === projectId
    );
  }
  saveResult(result: QualityGateResult) {
    this.results.set(result.qualityGateResultId, result);
    return result;
  }
  getResult(resultId: string) {
    return this.results.get(resultId);
  }
  listResults() {
    return [...this.results.values()];
  }
}

class MemoryArtifacts {
  artifacts = new Map<string, ArtifactContract>();
  save(artifact: ArtifactContract) {
    this.artifacts.set(artifact.artifactId, artifact);
    return artifact;
  }
  get(artifactId: string) {
    return this.artifacts.get(artifactId);
  }
  listByRun(runId: string) {
    return [...this.artifacts.values()].filter((artifact) => artifact.runId === runId);
  }
}

describe("quality output redaction", () => {
  it("redacts secret-like output before artifact capture", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "fulcrum-quality-redaction-"));
    const repository = new MemoryQualityRepository();
    const artifacts = new MemoryArtifacts();
    const runner = new QualityGateRunner(
      repository,
      new ArtifactService(artifacts, new LocalArtifactStorage(path.join(cwd, "artifacts")))
    );
    runner.define({
      gateId: "gate_secret",
      projectId: "proj_01",
      name: "secret",
      command: "node -e \"console.log('token=supersecretvalue')\"",
      required: true
    });

    const result = await runner.run({ gateId: "gate_secret", cwd, runId: "run_01" });

    expect(result.status).toBe("passed");
    expect(result.redactionStatus).toBe("redacted");
    expect(artifacts.listByRun("run_01")[0]?.redactionStatus).toBe("needs_review");
  });
});
