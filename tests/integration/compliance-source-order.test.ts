import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ComplianceService } from "@fulcrum/core";

describe("compliance source order", () => {
  it("supersedes real Go-first runtime language with amendment 02", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "fulcrum-source-order-"));
    writeFileSync(
      path.join(rootDir, "SRS-ammend-02.md"),
      "Fulcrum v0 should be implemented as a TypeScript-first monorepo."
    );
    writeFileSync(
      path.join(rootDir, "SRS-ammend-01.md"),
      [
        "## Implementation Language Recommendation",
        "",
        "Write Fulcrum core in Go.",
        "",
        "Fulcrum core should be implemented in Go."
      ].join("\n")
    );

    const audit = new ComplianceService().audit({
      rootDir,
      sources: ["SRS-ammend-02.md", "SRS-ammend-01.md"]
    });
    const goRequirement = audit.requirements.find((requirement) => requirement.text.includes("Go"));

    expect(goRequirement).toMatchObject({
      status: "superseded",
      supersededBy: "SRS-AMEND-02-001"
    });
    expect(audit.summary.superseded).toBeGreaterThanOrEqual(1);
  });
});
