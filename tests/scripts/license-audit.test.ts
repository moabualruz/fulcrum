import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { auditLicenses } from "../../scripts/license-audit.ts";

const fixturesDir = join(import.meta.dir, "license-audit.fixtures");

describe("license audit", () => {
  test("pretend-MIT fixture passes audit", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "fulcrum-license-audit-"));
    try {
      const result = await auditLicenses({
        rootDir: join(fixturesDir, "pretend-mit"),
        reportPath: join(outputDir, "LICENSE-DEPS.md"),
      });

      expect(result.ok).toBe(true);
      expect(result.summary.fail).toBe(0);
      expect(result.packages).toEqual([
        expect.objectContaining({
          name: "pretend-mit",
          version: "1.0.0",
          license: "MIT",
          classification: "PASS",
          source: "license",
        }),
      ]);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  test("pretend-AGPL fixture fails audit", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "fulcrum-license-audit-"));
    try {
      const result = await auditLicenses({
        rootDir: join(fixturesDir, "pretend-agpl"),
        reportPath: join(outputDir, "LICENSE-DEPS.md"),
      });

      expect(result.ok).toBe(false);
      expect(result.summary.fail).toBe(1);
      expect(result.packages).toEqual([
        expect.objectContaining({
          name: "pretend-agpl",
          version: "1.0.0",
          license: "AGPL-3.0-only",
          classification: "FAIL",
          source: "license",
        }),
      ]);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
