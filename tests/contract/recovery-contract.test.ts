import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BackupManifestSchema, ExportRecordSchema } from "@fulcrum/shared";
import { FileExportRepository, RecoveryExportService } from "@fulcrum/core";

describe("recovery contracts", () => {
  it("validates backup manifests and export records with preservation metadata", () => {
    const manifest = BackupManifestSchema.parse({
      backupId: "backup_fixture",
      createdAt: new Date(0).toISOString(),
      sourceStateRoot: "/tmp/fulcrum",
      includedRecords: { projects: 1, tasks: 2, runs: 1 },
      includedArtifacts: [{ type: "artifact", uri: "/tmp/fulcrum/artifacts/a.log" }],
      includedLogs: [{ type: "log", uri: "/tmp/fulcrum/logs/run.log" }],
      includedMemory: [{ type: "memory", uri: "/tmp/fulcrum/memory/notes.md" }],
      includedContextPacks: ["ctx_pack"],
      integrityStatus: "valid",
      redactionStatus: "not_applicable",
      localRef: "/tmp/fulcrum/backups/backup_fixture",
      contentHash: "abc123",
      schemaVersion: "1.0"
    });
    const record = ExportRecordSchema.parse({
      exportId: "export_fixture",
      format: "json",
      includedEntityClasses: ["projects", "tasks", "runs"],
      createdAt: new Date(0).toISOString(),
      localRef: "/tmp/fulcrum/export_fixture.json",
      redactionStatus: "redacted",
      provenanceCoverage: "partial",
      policyDecisionId: "pol_sensitive_export",
      contentHash: "def456",
      schemaVersion: "1.0"
    });

    expect(manifest.integrityStatus).toBe("valid");
    expect(manifest.includedArtifacts[0]?.uri).toContain("artifacts");
    expect(record.redactionStatus).toBe("redacted");
    expect(record.provenanceCoverage).toBe("partial");
  });

  it("exports local state with provenance refs and redacted secret-like fields", () => {
    const root = mkdtempSync(join(tmpdir(), "fulcrum-export-"));
    const stateRoot = join(root, "state");
    const outputRoot = join(root, "exports");
    const storeFile = join(root, "recovery-manifests.json");
    mkdirSync(stateRoot, { recursive: true });
    writeFileSync(
      join(stateRoot, "work-state.json"),
      JSON.stringify({
        tasks: [
          {
            taskId: "task_secret",
            title: "Redact export",
            descriptionSnapshot: "token=super-secret-value"
          }
        ]
      })
    );

    const exports = new RecoveryExportService(new FileExportRepository(storeFile));
    const preview = exports.preview({
      stateRoot,
      outputRoot,
      format: "json",
      entityClasses: ["tasks"]
    });
    const record = exports.create({
      stateRoot,
      outputRoot,
      format: "json",
      entityClasses: ["tasks"],
      policyDecisionId: "pol_sensitive_export"
    });
    const body = JSON.parse(readFileSync(record.localRef, "utf8")) as {
      records: { tasks: Array<{ descriptionSnapshot: string }> };
      provenance: { tasks: Array<{ uri: string }> };
    };

    expect(preview.recordCounts.tasks).toBe(1);
    expect(preview.provenanceCoverage).toBe("complete");
    expect(record.redactionStatus).toBe("redacted");
    expect(record.provenanceCoverage).toBe("complete");
    expect(body.records.tasks[0]?.descriptionSnapshot).toBe("token=[REDACTED]");
    expect(body.provenance.tasks[0]?.uri).toContain("work-state.json#/tasks/0");
    expect(new FileExportRepository(storeFile).list()).toHaveLength(1);
  });
});
