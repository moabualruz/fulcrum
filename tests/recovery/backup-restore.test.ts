import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BackupManifestService,
  FileBackupRepository,
  RestoreValidationService
} from "@fulcrum/core";

describe("backup restore recovery", () => {
  it("captures local coverage and validates required references without touching user work", () => {
    const root = mkdtempSync(join(tmpdir(), "fulcrum-recovery-"));
    mkdirSync(join(root, "artifacts"), { recursive: true });
    mkdirSync(join(root, "logs"), { recursive: true });
    mkdirSync(join(root, "memory"), { recursive: true });
    writeFileSync(join(root, "artifacts", "run.log"), "artifact");
    writeFileSync(join(root, "logs", "run.log"), "log");
    writeFileSync(join(root, "memory", "notes.md"), "# memory");
    writeFileSync(
      join(root, "work-state.json"),
      JSON.stringify({ projects: [{ projectId: "proj_1" }], tasks: [{ taskId: "task_1" }] })
    );

    const repository = new FileBackupRepository(join(root, "recovery-manifests.json"));
    const backup = new BackupManifestService(repository).create({
      stateRoot: root,
      outputRoot: join(root, "backups")
    });
    const restoredRepository = new FileBackupRepository(join(root, "recovery-manifests.json"));
    const restore = new RestoreValidationService(restoredRepository).validate(
      backup.backupId,
      join(root, "restore-target")
    );

    expect(restoredRepository.list()).toHaveLength(1);
    expect(backup.includedRecords).toMatchObject({ projects: 1, tasks: 1 });
    expect(backup.includedArtifacts).toHaveLength(1);
    expect(backup.includedLogs).toHaveLength(1);
    expect(backup.includedMemory).toHaveLength(1);
    expect(existsSync(join(backup.localRef, "state", "artifacts", "run.log"))).toBe(true);
    expect(restore.valid).toBe(true);
    expect(restore.checkedReferences).toEqual(
      expect.arrayContaining(["tasks", "runs", "artifacts", "policy_decisions", "context_packs"])
    );
    expect(restore.preservedUserWork).toBe(true);

    rmSync(join(backup.localRef, "state", "artifacts", "run.log"));
    const broken = new RestoreValidationService(restoredRepository).validate(
      backup.backupId,
      join(root, "restore-target")
    );
    expect(broken.valid).toBe(false);
    expect(broken.brokenReferences).toEqual(
      expect.arrayContaining([join(backup.localRef, "state", "artifacts", "run.log")])
    );
  });
});
