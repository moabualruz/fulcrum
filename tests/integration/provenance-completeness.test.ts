import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RecoveryExportService, type ExportRepositoryPort } from "@fulcrum/core";
import type { ExportRecord, SourceRef } from "@fulcrum/shared";

class MemoryExportRepository implements ExportRepositoryPort {
  records: ExportRecord[] = [];
  save(record: ExportRecord): ExportRecord {
    this.records.push(record);
    return record;
  }
  list(): ExportRecord[] {
    return this.records;
  }
}

describe("provenance completeness", () => {
  it("requires source references for context, code, memory, artifacts, quality gates, and exports", () => {
    const root = mkdtempSync(path.join(tmpdir(), "fulcrum-provenance-"));
    mkdirSync(path.join(root, "artifacts"), { recursive: true });
    writeFileSync(path.join(root, "artifacts", "proof.txt"), "proof");
    const records = {
      context_packs: [{ contextPackId: "ctx_1" }],
      code_evidence: [{ evidenceId: "code_1" }],
      memory: [{ memoryId: "mem_1" }],
      artifacts: [{ artifactId: "artifact_1" }],
      quality_gate_results: [{ qualityGateResultId: "qgr_1" }],
      exports: [{ exportId: "export_1" }]
    };
    const provenance = Object.fromEntries(
      Object.keys(records).map((entityClass) => [
        entityClass,
        [{ type: "local_state", uri: `file://${entityClass}.json` } satisfies SourceRef]
      ])
    );

    const created = new RecoveryExportService(new MemoryExportRepository()).create({
      outputRoot: root,
      format: "json",
      entityClasses: Object.keys(records),
      records,
      provenance
    });

    const exported = JSON.parse(readFileSync(created.localRef, "utf8")) as {
      provenanceCoverage: string;
      provenance: Record<string, SourceRef[]>;
    };
    expect(exported.provenanceCoverage).toBe("complete");
    expect(
      Object.values(exported.provenance)
        .flat()
        .every((ref) => ref.type && ref.uri)
    ).toBe(true);
  });
});
