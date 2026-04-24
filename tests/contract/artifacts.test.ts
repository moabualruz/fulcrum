import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactService, LocalArtifactStorage, type ArtifactRepositoryPort } from "@fulcrum/core";
import type { ArtifactContract } from "@fulcrum/shared";

class MemoryArtifactRepository implements ArtifactRepositoryPort {
  readonly artifacts = new Map<string, ArtifactContract>();

  save(artifact: ArtifactContract): ArtifactContract {
    this.artifacts.set(artifact.artifactId, artifact);
    return artifact;
  }

  get(artifactId: string): ArtifactContract | undefined {
    return this.artifacts.get(artifactId);
  }

  listByRun(runId: string): ArtifactContract[] {
    return [...this.artifacts.values()].filter((artifact) => artifact.runId === runId);
  }
}

describe("artifact contracts", () => {
  it("attaches, shows, lists, and records provenance/redaction/storage refs", async () => {
    const root = await mkdir(path.join(os.tmpdir(), `fulcrum-artifacts-${Date.now()}`), {
      recursive: true
    });
    const file = path.join(root, "run.log");
    await writeFile(file, "hello");
    const repo = new MemoryArtifactRepository();
    const service = new ArtifactService(repo, new LocalArtifactStorage(root));

    const artifact = await service.attach({
      type: "log",
      localRef: file,
      summary: "Run log",
      runId: "run_01",
      taskId: "task_01",
      projectId: "proj_01",
      capturedBy: "test"
    });

    expect(artifact.sizeBytes).toBe(5);
    expect(artifact.redactionStatus).toBe("needs_review");
    expect(artifact.provenance.capturedBy).toBe("test");
    expect(service.show(artifact.artifactId)?.storageRef).toBe("proj_01/run_01/run.log");
    expect(service.listForRun("run_01")).toHaveLength(1);
  });
});
