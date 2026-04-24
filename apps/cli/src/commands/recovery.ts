import {
  BackupManifestService,
  RebuildOrchestrator,
  RecoveryExportService,
  ResetUninstallPreviewService,
  RestoreValidationService
} from "@fulcrum/core";

export interface RecoveryCommandDeps {
  backups: BackupManifestService;
  restore: RestoreValidationService;
  exports: RecoveryExportService;
  rebuild: RebuildOrchestrator;
  previews: ResetUninstallPreviewService;
}

export function createBackupCommand(
  deps: RecoveryCommandDeps,
  request: { stateRoot: string; outputRoot: string; includeContextPacks?: boolean }
) {
  return deps.backups.create(request);
}

export function listBackupsCommand(deps: RecoveryCommandDeps) {
  return deps.backups.list();
}

export function restoreBackupCommand(
  deps: RecoveryCommandDeps,
  request: { backupId: string; target: string }
) {
  return deps.restore.validate(request.backupId, request.target);
}

export function exportRecoveryCommand(
  deps: RecoveryCommandDeps,
  request: {
    outputRoot: string;
    format: "json" | "jsonl";
    entityClasses: string[];
    stateRoot?: string;
    records?: Record<string, unknown[]>;
    policyDecisionId?: string;
  }
) {
  return deps.exports.create({
    ...request
  });
}

export function rebuildCommand(
  deps: RecoveryCommandDeps,
  availableSources?: Partial<Record<string, number>>
) {
  return deps.rebuild.rebuild(availableSources);
}

export function resetPreviewCommand(
  deps: RecoveryCommandDeps,
  request: { stateRoot: string; purgeBackups?: boolean }
) {
  return deps.previews.preview({ action: "reset", ...request });
}

export function uninstallPreviewCommand(
  deps: RecoveryCommandDeps,
  request: { stateRoot: string; purgeBackups?: boolean }
) {
  return deps.previews.preview({ action: "uninstall", ...request });
}
