import { makeId, SCHEMA_VERSION, type ArtifactContract } from "@fulcrum/shared";
import { LocalArtifactStorage } from "./storage.js";

export interface AttachArtifactInput {
  type: ArtifactContract["type"];
  localRef: string;
  summary: string;
  projectId?: string;
  taskId?: string;
  runId?: string;
  capturedBy: string;
}

export interface ArtifactRepositoryPort {
  save(artifact: ArtifactContract & { createdAt: string; updatedAt: string }): ArtifactContract;
  get(artifactId: string): ArtifactContract | undefined;
  listByRun(runId: string): ArtifactContract[];
}

export class ArtifactService {
  constructor(
    private readonly artifacts: ArtifactRepositoryPort,
    private readonly storage: LocalArtifactStorage
  ) {}

  async attach(input: AttachArtifactInput): Promise<ArtifactContract> {
    const stored = await this.storage.store(input.localRef, input.projectId, input.runId);
    const now = new Date().toISOString();
    return this.artifacts.save({
      artifactId: makeId("art", `${input.runId ?? input.taskId ?? "artifact"}-${now}`),
      type: input.type,
      localRef: input.localRef,
      summary: input.summary,
      projectId: input.projectId,
      taskId: input.taskId,
      runId: input.runId,
      hash: stored.hash,
      sizeBytes: stored.sizeBytes,
      storageRef: stored.storageRef,
      sourceRefs: [{ type: "file", uri: input.localRef }],
      linkedRefs: [],
      retention: "keep",
      redactionStatus: "needs_review",
      provenance: { capturedBy: input.capturedBy, capturedAt: now },
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now
    });
  }

  show(artifactId: string): ArtifactContract | undefined {
    return this.artifacts.get(artifactId);
  }

  listForRun(runId: string): ArtifactContract[] {
    return this.artifacts.listByRun(runId);
  }
}
