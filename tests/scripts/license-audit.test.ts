import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { auditLicenses, classifyLicense } from "../../scripts/license-audit.ts";

const fixturesDir = join(import.meta.dir, "license-audit.fixtures");
const scriptPath = join(import.meta.dir, "../../scripts/license-audit.ts");
const copyleftLicenses = [
  "GPL-2.0",
  "GPL-3.0",
  "LGPL-2.1",
  "LGPL-3.0",
  "GPL-2.0-only",
  "GPL-3.0-only",
  "LGPL-2.1-only",
  "LGPL-3.0-only",
  "LGPL-2.1-or-later",
  "LGPL-3.0-or-later",
];

describe("license audit", () => {
  test("CC0-1.0 SPDX alias passes audit", () => {
    expect(classifyLicense("CC0-1.0")).toBe("PASS");
  });

  test("GPL and LGPL SPDX identifiers fail audit", () => {
    for (const license of copyleftLicenses) {
      expect(classifyLicense(license)).toBe("FAIL");
    }
  });

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

  test("missing license field classifies as UNKNOWN", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "fulcrum-license-audit-"));
    try {
      const result = await auditLicenses({
        rootDir: join(fixturesDir, "missing-license"),
        reportPath: join(outputDir, "LICENSE-DEPS.md"),
      });

      expect(result.ok).toBe(true);
      expect(result.summary.unknown).toBe(1);
      expect(result.packages).toEqual([
        expect.objectContaining({
          name: "pretend-missing-license",
          version: "1.0.0",
          license: "UNKNOWN",
          classification: "UNKNOWN",
          source: "missing",
        }),
      ]);
      expect(result.warnings).toContain("unknown license: pretend-missing-license@1.0.0 (UNKNOWN)");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  test("multi-license SPDX OR expression passes audit", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "fulcrum-license-audit-"));
    try {
      const result = await auditLicenses({
        rootDir: join(fixturesDir, "multi-license"),
        reportPath: join(outputDir, "LICENSE-DEPS.md"),
      });

      expect(result.ok).toBe(true);
      expect(result.summary.fail).toBe(0);
      expect(result.packages).toEqual([
        expect.objectContaining({
          name: "pretend-dual",
          version: "1.0.0",
          license: "MIT OR Apache-2.0",
          classification: "PASS",
          source: "license",
        }),
      ]);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  test("invalid package JSON emits stderr warning and continues", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "fulcrum-license-audit-"));
    try {
      const proc = Bun.spawn(
        [
          "bun",
          "run",
          scriptPath,
          "--root",
          join(fixturesDir, "invalid-json"),
          "--report",
          join(outputDir, "LICENSE-DEPS.md"),
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      expect(exitCode).toBe(0);
      expect(stderr).toContain("warn: invalid package.json:");
      expect(stderr).toContain("node_modules/pretend-invalid/package.json");
      expect(stdout).toContain("license-audit: 1 pass, 0 fail, 0 unknown, 1 total");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
