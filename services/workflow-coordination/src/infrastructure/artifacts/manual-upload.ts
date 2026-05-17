import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

import { LocalFsBackend, type StorageBackend } from "./storage.ts";

export type ManualArtifactAttachmentKind = "task" | "doc" | "run";

export interface UploadManualArtifactInput {
  org?: unknown;
  orgSlug: string;
  projectId?: string | null;
  projectSlug?: string | null;
  sourcePath: string;
  filename: string;
  mime: string;
  attachedTo: {
    kind: ManualArtifactAttachmentKind;
    id: string;
  };
  metadataJson?: Record<string, unknown>;
  deps: ManualArtifactUploadDeps;
}

export interface ManualArtifactUploadDeps {
  storageBackend?: StorageBackend;
  artifactRepository: ManualArtifactRepositoryLike;
  edgeRepository: ManualEdgeRepositoryLike;
  eventRepository?: ManualArtifactEventRepositoryLike;
}

export interface ManualArtifactLike {
  id: string;
  org?: unknown;
  projectId?: string | null;
  taskId?: string | null;
  runId?: string | null;
  docId?: string | null;
  filename: string;
  mime: string;
  sizeBytes: bigint;
  path: string;
  checksumSha256: string;
  metadataJson: Record<string, unknown>;
}

interface ManualArtifactRepositoryLike {
  create: (input: Omit<ManualArtifactLike, "id">) => Promise<ManualArtifactLike> | ManualArtifactLike;
}

interface ManualEdgeRepositoryLike {
  createMany: (input: Record<string, unknown>[]) => Promise<unknown> | unknown;
}

interface ManualArtifactEventRepositoryLike {
  recordArtifactUploaded?: (input: {
    org?: unknown;
    artifact: ManualArtifactLike;
  }) => Promise<unknown> | unknown;
}

export class ArtifactUploadTooLargeError extends Error {
  constructor(
    readonly sizeBytes: number,
    readonly maxSizeBytes: number,
    readonly maxSizeMb: number,
  ) {
    super(`Artifact exceeds FULCRUM_ARTIFACT_MAX_SIZE_MB=${maxSizeMb}.`);
    this.name = "ArtifactUploadTooLargeError";
  }
}

export async function uploadManualArtifact(
  input: UploadManualArtifactInput,
): Promise<ManualArtifactLike> {
  const fileStat = await stat(input.sourcePath);
  enforceMaxSize(fileStat.size);

  const checksumSha256 = await sha256File(input.sourcePath);
  const storageBackend = input.deps.storageBackend ?? new LocalFsBackend();
  const stored = await storageBackend.put({
    orgSlug: input.orgSlug,
    projectSlug: input.projectSlug,
    filename: input.filename,
    source: input.sourcePath,
  });
  const artifact = await input.deps.artifactRepository.create({
    org: input.org,
    projectId: input.projectId ?? null,
    taskId: input.attachedTo.kind === "task" ? input.attachedTo.id : null,
    runId: input.attachedTo.kind === "run" ? input.attachedTo.id : null,
    docId: input.attachedTo.kind === "doc" ? input.attachedTo.id : null,
    filename: input.filename,
    mime: input.mime,
    sizeBytes: BigInt(fileStat.size),
    path: stored.relativePath,
    checksumSha256,
    metadataJson: input.metadataJson ?? {},
  });

  await input.deps.edgeRepository.createMany([
    {
      org: input.org,
      fromKind: "artifact",
      fromId: artifact.id,
      toKind: input.attachedTo.kind,
      toId: input.attachedTo.id,
      kind: "attached_to",
    },
  ]);
  await input.deps.eventRepository?.recordArtifactUploaded?.({ org: input.org, artifact });

  return artifact;
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function enforceMaxSize(sizeBytes: number): void {
  const rawMaxSizeMb = process.env.FULCRUM_ARTIFACT_MAX_SIZE_MB;
  if (!rawMaxSizeMb) return;

  const maxSizeMb = Number(rawMaxSizeMb);
  if (!Number.isFinite(maxSizeMb) || maxSizeMb < 0) {
    throw new Error(`Invalid FULCRUM_ARTIFACT_MAX_SIZE_MB: ${rawMaxSizeMb}`);
  }

  const maxSizeBytes = maxSizeMb * 1024 * 1024;
  if (sizeBytes > maxSizeBytes) {
    throw new ArtifactUploadTooLargeError(sizeBytes, maxSizeBytes, maxSizeMb);
  }
}
