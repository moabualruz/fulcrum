import { describe, expect, test } from "bun:test";
import { discoverChecks, buildDoctorReport, DoctorReportSchema } from "./index.ts";

describe("discoverChecks", () => {
  test("discovers CLI checks module", async () => {
    const checks = await discoverChecks();
    expect(checks.length).toBeGreaterThan(0);
    const cliChecks = checks.filter((c) => c.subsystem === "cli");
    expect(cliChecks.length).toBe(6);
  });

  test("all discovered checks have required fields", async () => {
    const checks = await discoverChecks();
    for (const check of checks) {
      expect(typeof check.name).toBe("string");
      expect(typeof check.subsystem).toBe("string");
      expect(typeof check.run).toBe("function");
    }
  });
});

describe("buildDoctorReport", () => {
  test("produces Zod-valid DoctorReport", async () => {
    const report = await buildDoctorReport();
    // Should not throw — Zod validation happens inside buildDoctorReport.
    const parsed = DoctorReportSchema.parse(report);
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.timestamp).toBeTruthy();
    expect(parsed.checks.length).toBeGreaterThan(0);
    expect(parsed.summary.total).toBe(parsed.checks.length);
    expect(parsed.summary.ok + parsed.summary.warn + parsed.summary.fail).toBe(parsed.summary.total);
  });

  test("--subsystem filters to named subsystem only", async () => {
    const report = await buildDoctorReport({ subsystem: "cli" });
    expect(report.checks.length).toBeGreaterThan(0);
    expect(report.checks.every((c) => c.subsystem === "cli")).toBe(true);
  });

  test("--subsystem with nonexistent name produces empty checks", async () => {
    const report = await buildDoctorReport({ subsystem: "nonexistent" });
    expect(report.checks).toHaveLength(0);
    expect(report.summary.total).toBe(0);
  });

  test("exit 0 on clean install (no fail checks)", async () => {
    const report = await buildDoctorReport();
    // On a dev machine, CLI checks should pass or warn — never fail.
    // This matches AC: "exit 0 on clean install"
    expect(report.summary.fail).toBe(0);
  });
});

describe("DoctorReport Zod schema", () => {
  test("rejects invalid report shapes", () => {
    expect(() => DoctorReportSchema.parse({})).toThrow();
    expect(() =>
      DoctorReportSchema.parse({
        version: "1.0.0",
        timestamp: "now",
        checks: [{ name: "x", subsystem: "y", status: "invalid", message: "", durationMs: 0 }],
        summary: { total: 1, ok: 0, warn: 0, fail: 1 },
      }),
    ).toThrow();
  });

  test("accepts valid report", () => {
    const report = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      checks: [
        { name: "test", subsystem: "cli", status: "ok", message: "good", durationMs: 5 },
      ],
      summary: { total: 1, ok: 1, warn: 0, fail: 0 },
    };
    expect(() => DoctorReportSchema.parse(report)).not.toThrow();
  });
});
