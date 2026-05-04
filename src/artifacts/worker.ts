import {
  harvestArtifacts as defaultHarvestArtifacts,
  type HarvestArtifactDeps,
  type HarvestArtifactsInput,
  type HarvestArtifactsResult,
} from "./harvest.ts";

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
