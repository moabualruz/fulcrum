import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ComplianceService } from "@fulcrum/core";

describe("compliance contract", () => {
  it("extracts multiline Product/SRS requirements into contract JSON with gate metadata", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "fulcrum-compliance-"));
    writeFileSync(
      path.join(rootDir, "SRS.md"),
      [
        "# SRS",
        "FR-DOC-003:",
        "Doctor MUST report exact next action.",
        "",
        "NFR-LOCAL-001:",
        "Core workflows shall not require network access."
      ].join("\n")
    );

    const audit = new ComplianceService().audit({ rootDir, sources: ["SRS.md"] });

    expect(audit).toMatchObject({
      schemaVersion: "1.0",
      sourceOrder: ["SRS.md"],
      pass: false
    });
    expect(audit.requirements).toHaveLength(2);
    expect(audit.requirements[0]).toMatchObject({
      requirementId: "FR-DOC-003",
      sourceFile: "SRS.md",
      text: "Doctor MUST report exact next action.",
      status: "missing",
      implementationRefs: [],
      testRefs: []
    });
    expect(audit.requirements[1]).toMatchObject({
      requirementId: "NFR-LOCAL-001",
      sourceFile: "SRS.md",
      text: "Core workflows shall not require network access.",
      status: "missing"
    });
    expect(audit.blockingRequirementIds).toEqual(
      expect.arrayContaining(["FR-DOC-003", "NFR-LOCAL-001"])
    );
  });

  it("supports explicit repo roots from the CLI source-checkout entrypoint", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "fulcrum-compliance-cli-"));
    writeFileSync(path.join(rootDir, "SRS.md"), "FR-DOC-003:\nDoctor MUST report exact next action.\n");

    const output = execFileSync(
      "pnpm",
      [
        "exec",
        "tsx",
        "src/main.ts",
        "--json",
        "compliance",
        "audit",
        "--root",
        rootDir,
        "--sources",
        "SRS.md"
      ],
      {
        cwd: path.join(process.cwd(), "apps/cli"),
        encoding: "utf8"
      }
    );
    const payload = JSON.parse(output) as {
      status: string;
      data: { sourceOrder: string[]; requirements: Array<{ requirementId: string }> };
    };

    expect(payload.status).toBe("blocked");
    expect(payload.data.sourceOrder).toEqual(["SRS.md"]);
    expect(payload.data.requirements.map((item) => item.requirementId)).toEqual(["FR-DOC-003"]);
  });
});
