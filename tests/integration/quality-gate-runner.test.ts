import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ArtifactService,
  LocalArtifactStorage,
  QualityGateRunner,
  RunQualityLinker,
  type RunRepositoryPort
} from "@fulcrum/core";
import type {
  ArtifactContract,
  QualityGateDefinition,
  QualityGateResult,
  Run,
  RunEvent
} from "@fulcrum/shared";

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

  listResults(input: { projectId: string; runId?: string; taskId?: string }) {
    return [...this.results.values()].filter(
      (result) =>
        result.projectId === input.projectId &&
        (!input.runId || result.runId === input.runId) &&
        (!input.taskId || result.taskId === input.taskId)
    );
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

class MemoryRunRepository implements RunRepositoryPort {
  runs = new Map<string, Run>();
  events: RunEvent[] = [];

  save(run: Run) {
    this.runs.set(run.runId, run);
    return run;
  }

  get(runId: string) {
    return this.runs.get(runId);
  }

  list(projectId?: string) {
    return [...this.runs.values()].filter((run) => !projectId || run.projectId === projectId);
  }

  appendEvent(event: Omit<RunEvent, "sequence">) {
    const saved = { ...event, sequence: this.events.length };
    this.events.push(saved);
    return saved;
  }

  listEvents(runId: string) {
    return this.events.filter((event) => event.runId === runId);
  }
}

describe("quality gate runner", () => {
  it("runs pass, fail, timeout, and skipped gates with artifacts", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "fulcrum-quality-"));
    await writeFile(path.join(cwd, "check.cjs"), "console.log('ok')\n", "utf8");
    const repository = new MemoryQualityRepository();
    const artifactRepo = new MemoryArtifacts();
    const runner = new QualityGateRunner(
      repository,
      new ArtifactService(artifactRepo, new LocalArtifactStorage(path.join(cwd, "artifacts")))
    );
    const pass = runner.define({
      gateId: "gate_pass",
      projectId: "proj_01",
      name: "pass",
      command: "node check.cjs",
      required: true
    });
    runner.define({
      gateId: "gate_fail",
      projectId: "proj_01",
      name: "fail",
      command: 'node -e "process.exit(2)"',
      required: false
    });
    runner.define({
      gateId: "gate_timeout",
      projectId: "proj_01",
      name: "timeout",
      command: 'node -e "setTimeout(()=>{}, 1000)"',
      required: false,
      timeoutMs: 10
    });

    const passed = await runner.run({ gateId: pass.gateId, cwd, runId: "run_01" });
    const failed = await runner.run({ gateId: "gate_fail", cwd, runId: "run_01" });
    const timeout = await runner.run({ gateId: "gate_timeout", cwd, runId: "run_01" });
    const skipped = await runner.run({ gateId: "gate_pass", cwd, runId: "run_01", skip: true });

    expect(passed.status).toBe("passed");
    expect(failed.status).toBe("failed");
    expect(timeout.status).toBe("timeout");
    expect(skipped.status).toBe("skipped");
    expect(passed.workingDirectory).toBe(cwd);
    expect(artifactRepo.listByRun("run_01")).toHaveLength(3);
    await expect(runner.run({ gateId: pass.gateId, cwd, projectId: "proj_other" })).rejects.toThrow(
      /belongs to project/
    );
  });

  it("links quality results and output artifacts back to the run event stream", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "fulcrum-quality-link-"));
    await writeFile(path.join(cwd, "check.cjs"), "console.log('linked')\n", "utf8");
    const repository = new MemoryQualityRepository();
    const artifactRepo = new MemoryArtifacts();
    const runRepo = new MemoryRunRepository();
    const now = new Date(0).toISOString();
    runRepo.save({
      runId: "run_01",
      taskId: "task_01",
      projectId: "proj_01",
      agentId: "agent_01",
      commandIdentity: "agent_01",
      status: "running",
      heartbeatState: "missing",
      logArtifactIds: [],
      artifactIds: [],
      qualityGateIds: [],
      policyDecisionIds: [],
      redactionStatus: "not_applicable",
      createdAt: now,
      updatedAt: now,
      schemaVersion: "1.0"
    });
    const runner = new QualityGateRunner(
      repository,
      new ArtifactService(artifactRepo, new LocalArtifactStorage(path.join(cwd, "artifacts"))),
      runRepo,
      new RunQualityLinker(runRepo, repository)
    );
    runner.define({
      gateId: "gate_linked",
      projectId: "proj_01",
      name: "linked",
      command: "node check.cjs",
      required: true
    });

    const result = await runner.run({ gateId: "gate_linked", cwd, runId: "run_01" });
    const updatedRun = runRepo.get("run_01");

    expect(result.status).toBe("passed");
    expect(updatedRun?.qualityGateIds).toContain(result.qualityGateResultId);
    expect(updatedRun?.artifactIds).toContain(result.outputArtifactId);
    expect(runRepo.listEvents("run_01").map((event) => event.type)).toEqual([
      "quality.started",
      "quality.completed"
    ]);
    expect(runRepo.listEvents("run_01")[1]?.artifactRefs).toEqual([result.outputArtifactId]);
  });
});
