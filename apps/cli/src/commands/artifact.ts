import type { ArtifactService } from "@fulcrum/core";

export interface ArtifactCommandDeps {
  artifacts: ArtifactService;
}

export async function attachArtifactCommand(
  deps: ArtifactCommandDeps,
  input: {
    type:
      | "log"
      | "transcript"
      | "context"
      | "quality_output"
      | "diff"
      | "export"
      | "backup"
      | "memory_source"
      | "code_evidence"
      | "other";
    localRef: string;
    summary: string;
    runId?: string;
    taskId?: string;
    projectId?: string;
  }
) {
  return deps.artifacts.attach({ ...input, capturedBy: "cli.artifact.attach" });
}

export function showArtifactCommand(deps: ArtifactCommandDeps, artifactId: string) {
  return deps.artifacts.show(artifactId);
}

export function listRunArtifactsCommand(deps: ArtifactCommandDeps, runId: string) {
  return deps.artifacts.listForRun(runId);
}
