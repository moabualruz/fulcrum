import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { LocalFsBackend, type StorageBackend } from "./storage.ts";

export const ARTIFACT_PRUNE_TASK = "artifact.prune";
export const ARTIFACT_PRUNE_CRON = "0 2 * * *";
export const ARTIFACT_PRUNE_GRACE_DAYS = 7;
export const ARTIFACT_PRUNE_CONFIRM_BYTES = 100n * 1024n * 1024n;
export const ARTIFACT_PRUNE_CONFIRM_FILES = 100;

export interface ArtifactPrunePayload {
  dryRun?: boolean;
  confirm?: boolean;
  projectId?: string;
}

export interface PruneArtifactsInput extends ArtifactPrunePayload {
  now?: Date;
  logDir?: string;
  deps: ArtifactPruneDeps;
}

export interface ArtifactPruneDeps {
  artifactRepository: ArtifactPruneRepository;
  storageBackend?: StorageBackend;
  eventRepository?: ArtifactPruneEventRepository;
}

export interface ArtifactPruneRepository {
  findExpiredForPrune: (input: {
    now: Date;
    projectId?: string;
  }) => Promise<PrunableArtifact[]> | PrunableArtifact[];
  findArchivedForHardDelete: (input: {
    before: Date;
    projectId?: string;
  }) => Promise<PrunableArtifact[]> | PrunableArtifact[];
  markArchived: (input: { id: string; archivedAt: Date }) => Promise<unknown> | unknown;
  hardDelete: (input: { id: string }) => Promise<unknown> | unknown;
}

export interface ArtifactPruneEventRepository {
  recordArtifactPruned?: (input: { count: number; bytesFreed: bigint }) => Promise<unknown> | unknown;
}

export interface PrunableArtifact {
  id: string;
  path: string;
  sizeBytes?: bigint | number;
  retentionUntil?: Date;
  archived?: boolean;
  archivedAt?: Date;
}

export interface PruneArtifactsResult {
  dryRun: boolean;
  softDeleted: number;
  hardDeleted: number;
  bytesFreed: bigint;
  candidates: PrunableArtifact[];
  hardDeleteCandidates: PrunableArtifact[];
  confirmationRequired: boolean;
}

export interface ArtifactPruneWorkerLike {
  addTask: (
    name: typeof ARTIFACT_PRUNE_TASK,
    handler: (payload: ArtifactPrunePayload) => Promise<void>,
  ) => void;
  addCronTask?: (name: typeof ARTIFACT_PRUNE_TASK, cron: typeof ARTIFACT_PRUNE_CRON) => void;
}

export interface RegisterPrunerCronOptions {
  deps?: ArtifactPruneDeps;
  pruneArtifacts?: (input: PruneArtifactsInput) => Promise<PruneArtifactsResult>;
}

export async function pruneArtifacts(input: PruneArtifactsInput): Promise<PruneArtifactsResult> {
  const now = input.now ?? new Date();
  const dryRun = input.dryRun === true;
  const storageBackend = input.deps.storageBackend ?? new LocalFsBackend();
  const candidates = await input.deps.artifactRepository.findExpiredForPrune({
    now,
    projectId: input.projectId,
  });
  const hardDeleteCandidates = await input.deps.artifactRepository.findArchivedForHardDelete({
    before: daysBefore(now, ARTIFACT_PRUNE_GRACE_DAYS),
    projectId: input.projectId,
  });
  const bytesFreed = candidates.reduce((sum, artifact) => sum + artifactSize(artifact), 0n);
  const confirmationRequired =
    !dryRun &&
    !input.confirm &&
    (candidates.length > ARTIFACT_PRUNE_CONFIRM_FILES || bytesFreed > ARTIFACT_PRUNE_CONFIRM_BYTES);

  if (dryRun) {
    await writeDryRunLog(input.logDir ?? defaultPruneLogDir(), now, candidates, hardDeleteCandidates);
    return result({ dryRun, bytesFreed, candidates, hardDeleteCandidates });
  }

  if (confirmationRequired) {
    return result({ dryRun, bytesFreed, candidates, hardDeleteCandidates, confirmationRequired });
  }

  let softDeleted = 0;
  for (const artifact of candidates) {
    await storageBackend.delete(artifact.path);
    await input.deps.artifactRepository.markArchived({ id: artifact.id, archivedAt: now });
    softDeleted += 1;
  }

  let hardDeleted = 0;
  for (const artifact of hardDeleteCandidates) {
    await input.deps.artifactRepository.hardDelete({ id: artifact.id });
    hardDeleted += 1;
  }

  if (softDeleted > 0) {
    await input.deps.eventRepository?.recordArtifactPruned?.({ count: softDeleted, bytesFreed });
  }

  return result({
    dryRun,
    softDeleted,
    hardDeleted,
    bytesFreed,
    candidates,
    hardDeleteCandidates,
  });
}

export function registerPrunerCron(
  worker: ArtifactPruneWorkerLike,
  options: RegisterPrunerCronOptions = {},
): void {
  const runPruner = options.pruneArtifacts ?? pruneArtifacts;

  worker.addTask(ARTIFACT_PRUNE_TASK, async (payload) => {
    if (!options.deps) {
      await runPruner(payload as PruneArtifactsInput);
      return;
    }
    await runPruner({ ...payload, deps: options.deps });
  });
  worker.addCronTask?.(ARTIFACT_PRUNE_TASK, ARTIFACT_PRUNE_CRON);
}

function result(input: {
  dryRun: boolean;
  softDeleted?: number;
  hardDeleted?: number;
  bytesFreed: bigint;
  candidates: PrunableArtifact[];
  hardDeleteCandidates: PrunableArtifact[];
  confirmationRequired?: boolean;
}): PruneArtifactsResult {
  return {
    dryRun: input.dryRun,
    softDeleted: input.softDeleted ?? 0,
    hardDeleted: input.hardDeleted ?? 0,
    bytesFreed: input.bytesFreed,
    candidates: input.candidates,
    hardDeleteCandidates: input.hardDeleteCandidates,
    confirmationRequired: input.confirmationRequired ?? false,
  };
}

function artifactSize(artifact: PrunableArtifact): bigint {
  if (typeof artifact.sizeBytes === "bigint") return artifact.sizeBytes;
  if (typeof artifact.sizeBytes === "number") return BigInt(artifact.sizeBytes);
  return 0n;
}

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

async function writeDryRunLog(
  logDir: string,
  now: Date,
  candidates: PrunableArtifact[],
  hardDeleteCandidates: PrunableArtifact[],
): Promise<void> {
  await mkdir(logDir, { recursive: true });
  await writeFile(
    path.join(logDir, `prune-${dateStamp(now)}.log`),
    [
      `artifact.prune dry-run ${now.toISOString()}`,
      `soft-delete candidates: ${candidates.length}`,
      ...candidates.map(formatArtifact),
      `hard-delete candidates: ${hardDeleteCandidates.length}`,
      ...hardDeleteCandidates.map(formatArtifact),
      "",
    ].join("\n"),
  );
}

function formatArtifact(artifact: PrunableArtifact): string {
  return `${artifact.id}\t${artifact.path}\t${artifactSize(artifact).toString()}`;
}

function dateStamp(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultPruneLogDir(): string {
  return path.join(homedir(), ".fulcrum", "logs");
}
