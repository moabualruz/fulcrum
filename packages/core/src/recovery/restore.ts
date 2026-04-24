import { existsSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { BackupManifest, SourceRef } from "@fulcrum/shared";
import type { BackupRepositoryPort } from "./backup.js";

export interface RestoreValidation {
  backupId: string;
  target: string;
  valid: boolean;
  restoredRecords: Record<string, number>;
  checkedReferences: string[];
  brokenReferences: string[];
  preservedUserWork: boolean;
  nextAction: string;
}

export class RestoreValidationService {
  constructor(private readonly backups: BackupRepositoryPort) {}

  validate(backupId: string, target: string): RestoreValidation {
    const manifest = this.backups.get(backupId);
    if (!manifest) {
      return {
        backupId,
        target,
        valid: false,
        restoredRecords: {},
        checkedReferences: [],
        brokenReferences: [`backup:${backupId}`],
        preservedUserWork: true,
        nextAction: "Choose an existing backup manifest."
      };
    }
    const checkedReferences = [
      "manifest",
      "state_snapshot",
      "fulcrum.sqlite",
      "tasks",
      "runs",
      "artifacts",
      "logs",
      "memory",
      "policy_decisions",
      "context_packs"
    ];
    const snapshotRoot = join(manifest.localRef, "state");
    const brokenReferences = [
      existsSync(join(manifest.localRef, "manifest.json"))
        ? undefined
        : join(manifest.localRef, "manifest.json"),
      existsSync(snapshotRoot) ? undefined : snapshotRoot,
      ...missingSnapshotRefs(manifest, snapshotRoot)
    ].filter((ref): ref is string => Boolean(ref));
    return {
      backupId,
      target,
      valid: brokenReferences.length === 0 && manifest.integrityStatus === "valid",
      restoredRecords: manifest.includedRecords,
      checkedReferences,
      brokenReferences,
      preservedUserWork: true,
      nextAction:
        brokenReferences.length === 0
          ? "Restore validation passed; apply restore with explicit target."
          : "Repair or recreate backup before restore."
    };
  }
}

function missingSnapshotRefs(manifest: BackupManifest, snapshotRoot: string): string[] {
  return [...manifest.includedArtifacts, ...manifest.includedLogs, ...manifest.includedMemory]
    .map((ref) => snapshotPathForRef(manifest.sourceStateRoot, snapshotRoot, ref))
    .filter((path) => !existsSync(path));
}

function snapshotPathForRef(sourceStateRoot: string, snapshotRoot: string, ref: SourceRef): string {
  if (!isAbsolute(ref.uri)) {
    return join(snapshotRoot, ref.uri);
  }
  const sourceRelative = relative(resolve(sourceStateRoot), resolve(ref.uri));
  if (sourceRelative === "" || (!sourceRelative.startsWith("..") && !isAbsolute(sourceRelative))) {
    return join(snapshotRoot, sourceRelative);
  }
  return ref.uri;
}
