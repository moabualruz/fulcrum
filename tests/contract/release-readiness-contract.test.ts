import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ReleaseValidator, REQUIRED_RELEASE_SECTIONS } from "@fulcrum/core";

describe("release readiness contract", () => {
  it("fails when Product/SRS compliance is incomplete or release evidence sections are missing", async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "fulcrum-release-root-"));
    const evidenceDir = mkdtempSync(path.join(tmpdir(), "fulcrum-release-evidence-"));
    const audit = {
      schemaVersion: "1.0" as const,
      generatedAt: new Date().toISOString(),
      sourceOrder: ["SRS.md"],
      summary: {
        implemented: 0,
        partial: 0,
        missing: 1,
        deferred: 0,
        superseded: 0,
        mockOnly: 0,
        previewOnly: 0,
        documentationOnly: 0
      },
      requirements: [
        {
          schemaVersion: "1.0" as const,
          requirementId: "FR-REL-001",
          sourceFile: "SRS.md",
          sourceLine: 1,
          text: "Release validation MUST fail missing evidence.",
          priority: "P1" as const,
          status: "missing" as const,
          implementationRefs: [],
          testRefs: [],
          evidenceRefs: [],
          nextAction: "Add complete implementation and non-mock tests for FR-REL-001."
        }
      ],
      blockingRequirementIds: ["FR-REL-001"],
      pass: false
    };

    const result = await new ReleaseValidator().validate({
      rootDir,
      evidenceDir,
      localOnly: true,
      audit
    });

    expect(result).toMatchObject({
      schemaVersion: "1.0",
      pass: false,
      evidenceRoot: evidenceDir
    });
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkId: "compliance.matrix",
          status: "failed",
          sourceRequirements: ["FR-REL-001"]
        }),
        expect.objectContaining({
          checkId: "release.section.compliance.matrix",
          status: "failed",
          sourceRequirements: ["FR-017", "FR-018"],
          artifacts: expect.arrayContaining(["sections/compliance-matrix.json"])
        })
      ])
    );
    expect(readFileSync(path.join(evidenceDir, "compliance-matrix.json"), "utf8")).toContain("FR-REL-001");
    expect(readFileSync(path.join(evidenceDir, "sections/compliance-matrix.json"), "utf8")).toContain(
      "\"status\": \"failed\""
    );
    expect(readFileSync(result.evidenceManifest, "utf8")).toContain("FR-REL-001");
  });

  it("passes only when every required section has executed evidence", async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "fulcrum-release-root-"));
    const evidenceDir = mkdtempSync(path.join(tmpdir(), "fulcrum-release-evidence-"));
    mkdirSync(path.join(evidenceDir, "sections"), { recursive: true });
    writeFileSync(
      path.join(rootDir, "SRS.md"),
      "FR-REL-002:\nRelease validation MUST write evidence.\n"
    );

    const sectionEvidence = Object.fromEntries(
      REQUIRED_RELEASE_SECTIONS.map((section) => {
        const file = `sections/${section.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.json`;
        writeFileSync(path.join(evidenceDir, file), JSON.stringify({ status: "passed" }));
        return [section, [file]];
      })
    );
    const audit = {
      schemaVersion: "1.0" as const,
      generatedAt: new Date().toISOString(),
      sourceOrder: ["SRS.md"],
      summary: {
        implemented: 1,
        partial: 0,
        missing: 0,
        deferred: 0,
        superseded: 0,
        mockOnly: 0,
        previewOnly: 0,
        documentationOnly: 0
      },
      requirements: [
        {
          schemaVersion: "1.0" as const,
          requirementId: "FR-REL-002",
          sourceFile: "SRS.md",
          sourceLine: 1,
          text: "Release validation MUST write evidence.",
          priority: "P1" as const,
          status: "implemented" as const,
          implementationRefs: ["packages/core/src/readiness/release-validator.ts"],
          testRefs: ["tests/contract/release-readiness-contract.test.ts"],
          evidenceRefs: ["sections/compliance-matrix.json"],
          nextAction: "Keep release evidence current."
        }
      ],
      blockingRequirementIds: [],
      pass: true
    };

    const result = await new ReleaseValidator().validate({
      rootDir,
      evidenceDir,
      localOnly: true,
      audit,
      sectionEvidence
    });

    expect(result.pass).toBe(true);
    expect(result.checks.every((check) => check.status === "passed")).toBe(true);
    expect(readFileSync(path.join(evidenceDir, "compliance-matrix.json"), "utf8")).toContain(
      "FR-REL-002"
    );
    expect(readFileSync(path.join(evidenceDir, "sections/compliance-matrix.json"), "utf8")).toContain(
      "\"status\": \"passed\""
    );
    expect(JSON.parse(readFileSync(result.evidenceManifest, "utf8"))).toMatchObject({
      pass: true,
      redactionStatus: "not_redacted"
    });
  });

  it("keeps local-only validation blocked when commands pass but compliance lacks implementation evidence", async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "fulcrum-release-local-only-"));
    const evidenceDir = mkdtempSync(path.join(tmpdir(), "fulcrum-release-local-evidence-"));
    const binDir = path.join(rootDir, "bin");
    mkdirSync(binDir, { recursive: true });
    writeExecutable(path.join(binDir, "pnpm"), "#!/usr/bin/env sh\nexit 0\n");
    writeExecutable(
      path.join(rootDir, ".specify/scripts/bash/check-prerequisites.sh"),
      "#!/usr/bin/env sh\nexit 0\n"
    );
    writeExecutable(
      path.join(rootDir, "tests/e2e/quickstart/product-install-readiness.sh"),
      "#!/usr/bin/env sh\nexit 0\n"
    );
    writeFileSync(
      path.join(rootDir, "FULCRUM_PRODUCT.md"),
      "PRODUCT-001:\nFulcrum MUST keep release claims backed by evidence.\n"
    );
    writeFileSync(path.join(rootDir, "SRS.md"), "# SRS\n");
    writeFileSync(
      path.join(rootDir, "SRS-ammend-01.md"),
      "SRS-AMEND-01-001:\nCopilot target MUST stay standalone.\n"
    );
    writeFileSync(
      path.join(rootDir, "SRS-ammend-02.md"),
      "SRS-AMEND-02-001:\nTypeScript-first direction MUST win runtime conflicts.\n"
    );

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}:${previousPath ?? ""}`;
    try {
      const result = await new ReleaseValidator().validate({
        rootDir,
        evidenceDir,
        localOnly: true
      });

      expect(result.pass).toBe(false);
      expect(result.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            checkId: "compliance.matrix",
            status: "failed",
            sourceRequirements: expect.arrayContaining(["PRODUCT-001"])
          })
        ])
      );
      expect(result.pack.complianceSummary).toMatchObject({
        implemented: 0,
        missing: 3
      });
    } finally {
      process.env.PATH = previousPath;
    }
  });
});

function writeExecutable(file: string, contents: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents);
  chmodSync(file, 0o755);
}
