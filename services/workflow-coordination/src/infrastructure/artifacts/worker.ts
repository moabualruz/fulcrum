import {
  harvestArtifacts as defaultHarvestArtifacts,
  type HarvestArtifactDeps,
  type HarvestArtifactsInput,
  type HarvestArtifactsResult,
} from "./harvest.ts";
import type { WorkerRegistry } from "@platform-core/application/jobs/registry.ts";
import { assertRecordPayload, assertStringField } from "@platform-core/application/jobs/registry.ts";

export const ARTIFACT_HARVEST_TASK = "artifact.harvest";

export interface ArtifactHarvestPayload {
  runId: string;
  extractedDir: string;
}

export interface ArtifactWorkerLike {
  addTask: (
    name: typeof ARTIFACT_HARVEST_TASK,
    handler: (payload: ArtifactHarvestPayload) => Promise<void>,
  ) => void;
}

export interface RegisterArtifactWorkerTasksOptions {
  orgSlug: string;
  projectSlug?: string | null;
  deps: HarvestArtifactDeps;
  harvestArtifacts?: (input: HarvestArtifactsInput) => Promise<HarvestArtifactsResult>;
}

export function registerArtifactWorkerTasks(
  worker: ArtifactWorkerLike,
  options: RegisterArtifactWorkerTasksOptions,
): void {
  const harvestArtifacts = options.harvestArtifacts ?? defaultHarvestArtifacts;

  worker.addTask(ARTIFACT_HARVEST_TASK, async (payload) => {
    await harvestArtifacts({
      runId: payload.runId,
      extractedDir: payload.extractedDir,
      orgSlug: options.orgSlug,
      projectSlug: options.projectSlug,
      deps: options.deps,
    });
  });
}

export function assertArtifactHarvestPayload(payload: unknown): asserts payload is ArtifactHarvestPayload {
  assertRecordPayload(payload, ARTIFACT_HARVEST_TASK);
  assertStringField(payload, "runId", ARTIFACT_HARVEST_TASK);
  assertStringField(payload, "extractedDir", ARTIFACT_HARVEST_TASK);
}

export function registerArtifactWorkerRegistryTasks(
  registry: WorkerRegistry,
  options: RegisterArtifactWorkerTasksOptions,
): void {
  const harvestArtifacts = options.harvestArtifacts ?? defaultHarvestArtifacts;

  registry.registerTask(ARTIFACT_HARVEST_TASK, assertArtifactHarvestPayload, async (payload) => {
    await harvestArtifacts({
      runId: payload.runId,
      extractedDir: payload.extractedDir,
      orgSlug: options.orgSlug,
      projectSlug: options.projectSlug,
      deps: options.deps,
    });
  });
}
