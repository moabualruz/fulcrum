import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BackupManifestService,
  FileBackupRepository,
  RebuildOrchestrator,
  RecoveryExportService,
  ResetUninstallPreviewService,
  RestoreValidationService
} from "@fulcrum/core";

describe("release recovery gates", () => {
  it("validates backup, restore, export, rebuild, reset, and uninstall gates preserve user work", () => {
    const root = mkdtempSync(path.join(tmpdir(), "fulcrum-release-recovery-"));
    mkdirSync(path.join(root, "artifacts"), { recursive: true });
    writeFileSync(path.join(root, "artifacts", "proof.log"), "proof");
    writeFileSync(
      path.join(root, "work-state.json"),
      JSON.stringify({ projects: [{ projectId: "p1" }] })
    );

    const backups = new FileBackupRepository(path.join(root, "recovery-manifests.json"));
    const backup = new BackupManifestService(backups).create({
      stateRoot: root,
      outputRoot: path.join(root, "backups")
    });
    const restore = new RestoreValidationService(backups).validate(
      backup.backupId,
      path.join(root, "restore")
    );
    const exportRecord = new RecoveryExportService({
      save: (record) => record,
      list: () => []
    }).create({
      outputRoot: path.join(root, "exports"),
      format: "json",
      entityClasses: ["projects"],
      stateRoot: root
    });
    const rebuild = new RebuildOrchestrator().rebuild({ indexes: 1, projections: 1 });
    const reset = new ResetUninstallPreviewService().preview({ action: "reset", stateRoot: root });
    const uninstall = new ResetUninstallPreviewService().preview({
      action: "uninstall",
      stateRoot: root
    });

    expect(restore.valid).toBe(true);
    expect(exportRecord.provenanceCoverage).toBe("complete");
    expect(rebuild.preservedCanonicalState).toBe(true);
    expect(reset.requiresConfirmation).toBe(true);
    expect(uninstall.preserve).toContain("registered project worktrees and repositories");
  });
});
