// Doctor orchestrator — discovers check modules, runs them via runner,
// and produces a DoctorReport.

import { readdir } from "node:fs/promises";
import { runChecks, type RunnerOpts } from "./runner.ts";
import { printJsonReport, printInteractiveReport } from "./output.ts";
import { DoctorReportSchema, type DoctorReport, type DoctorCheckDef, type DoctorCheckResult } from "./types.ts";

const VERSION = "1.0.0";

/**
 * Discover and load all check modules from this service-owned checks directory.
 * Each module must export `checks: DoctorCheckDef[]`.
 */
export async function discoverChecks(): Promise<DoctorCheckDef[]> {
  const checksDir = `${import.meta.dir}/checks`;
  const all: DoctorCheckDef[] = [];

  let entries: string[];
  try {
    entries = (await readdir(checksDir)).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );
  } catch {
    return all;
  }

  for (const file of entries.sort()) {
    try {
      const mod = await import(`./checks/${file}`);
      if (Array.isArray(mod.checks)) {
        all.push(...(mod.checks as DoctorCheckDef[]));
      }
    } catch {
      // Skip unloadable modules — they'll surface as missing checks.
    }
  }

  return all;
}

/**
 * Build a DoctorReport from discovered checks.
 */
export async function buildDoctorReport(opts: RunnerOpts = {}): Promise<DoctorReport> {
  const checks = await discoverChecks();
  const results = await runChecks(checks, opts);

  const summary = {
    total: results.length,
    ok: results.filter((r) => r.status === "ok").length,
    warn: results.filter((r) => r.status === "warn").length,
    fail: results.filter((r) => r.status === "fail").length,
  };

  const report: DoctorReport = {
    version: VERSION,
    timestamp: new Date().toISOString(),
    checks: results,
    summary,
  };

  // Validate against schema (catches shape drift).
  DoctorReportSchema.parse(report);

  return report;
}

/**
 * CLI entry point for `fulcrum doctor` orchestrator subcommand.
 */
export async function runOrchestrator(args: string[]): Promise<void> {
  const isJson = args.includes("--json");
  const subsystemIdx = args.indexOf("--subsystem");
  const subsystem = subsystemIdx >= 0 ? args[subsystemIdx + 1] : undefined;

  const report = await buildDoctorReport({ subsystem });

  if (isJson) {
    printJsonReport(report);
  } else {
    printInteractiveReport(report);
  }

  // Exit code: 0 = all pass or warn; 1 = any fail.
  if (report.summary.fail > 0) {
    process.exit(1);
  }
}

// Re-export types for external consumers (TUI, web).
export { DoctorReportSchema, type DoctorReport, type DoctorCheckResult, type DoctorCheckDef } from "./types.ts";
