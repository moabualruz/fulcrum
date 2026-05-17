import { describe, expect, it } from "bun:test";

import {
  ARTIFACT_HARVEST_TASK,
  registerArtifactWorkerTasks,
  type ArtifactHarvestPayload,
} from "@workflow-coordination/infrastructure/artifacts/worker.ts";
import type { HarvestArtifactDeps } from "@workflow-coordination/infrastructure/artifacts/harvest.ts";

describe("registerArtifactWorkerTasks", () => {
  it("registers artifact.harvest and calls harvestArtifacts with payload args", async () => {
    const worker = new FakeWorker();
    const harvestCalls: Array<{
      runId: string;
      extractedDir: string;
      orgSlug: string;
      projectSlug?: string | null;
      deps: HarvestArtifactDeps;
    }> = [];
    const deps = createDeps();

    registerArtifactWorkerTasks(worker, {
      orgSlug: "acme",
      projectSlug: "fulcrum",
      deps,
      harvestArtifacts: async (input) => {
        harvestCalls.push(input);
        return { artifacts: [] };
      },
    });

    await worker.run(ARTIFACT_HARVEST_TASK, {
      runId: "run_01",
      extractedDir: "/tmp/extracted",
    });

    expect(worker.taskNames()).toEqual([ARTIFACT_HARVEST_TASK]);
    expect(harvestCalls).toEqual([
      {
        runId: "run_01",
        extractedDir: "/tmp/extracted",
        orgSlug: "acme",
        projectSlug: "fulcrum",
        deps,
      },
    ]);
  });

  it("rethrows harvest errors so graphile-worker can retry the job", async () => {
    const worker = new FakeWorker();
    const failure = new Error("storage unavailable");

    registerArtifactWorkerTasks(worker, {
      orgSlug: "acme",
      deps: createDeps(),
      harvestArtifacts: async () => {
        throw failure;
      },
    });

    await expect(
      worker.run(ARTIFACT_HARVEST_TASK, {
        runId: "run_01",
        extractedDir: "/tmp/extracted",
      }),
    ).rejects.toBe(failure);
  });
});

class FakeWorker {
  private readonly tasks = new Map<string, (payload: ArtifactHarvestPayload) => Promise<void>>();

  addTask(name: string, handler: (payload: ArtifactHarvestPayload) => Promise<void>) {
    this.tasks.set(name, handler);
  }

  taskNames(): string[] {
    return [...this.tasks.keys()];
  }

  async run(name: string, payload: ArtifactHarvestPayload): Promise<void> {
    const task = this.tasks.get(name);
    if (!task) throw new Error(`Missing task: ${name}`);
    await task(payload);
  }
}

function createDeps(): HarvestArtifactDeps {
  return {
    artifactRepository: { create: async () => ({ id: "artifact_01", filename: "out.txt", path: "out.txt" }) },
    edgeRepository: { createMany: async () => undefined },
    searchDocumentRepository: { upsertArtifactPreview: async () => undefined },
    eventRepository: { recordArtifactHarvested: async () => undefined },
  };
}
