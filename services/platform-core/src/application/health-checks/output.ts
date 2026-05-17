// Doctor output — interactive colored output and --json mode.

import type { DoctorReport, DoctorCheckResult } from "./types.ts";

function statusIcon(status: string): string {
  switch (status) {
    case "ok": return "\x1b[32m✓\x1b[0m";   // green
    case "warn": return "\x1b[33m⚠\x1b[0m";  // yellow
    case "fail": return "\x1b[31m✗\x1b[0m";  // red
    default: return "·";
  }
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

export function printJsonReport(report: DoctorReport): void {
  console.log(JSON.stringify(report, null, 2));
}

export function printInteractiveReport(report: DoctorReport): void {
  console.log("fulcrum doctor — subsystem health checks\n");

  // Group by subsystem
  const bySubsystem = new Map<string, DoctorCheckResult[]>();
  for (const check of report.checks) {
    const list = bySubsystem.get(check.subsystem) ?? [];
    list.push(check);
    bySubsystem.set(check.subsystem, list);
  }

  for (const [subsystem, checks] of bySubsystem) {
    console.log(`${subsystem}:`);
    for (const check of checks) {
      const icon = statusIcon(check.status);
      console.log(`  ${icon} ${pad(check.name, 30)} ${check.message}  (${check.durationMs}ms)`);
      if (check.recovery && check.status !== "ok") {
        console.log(`    ↳ ${check.recovery}`);
      }
    }
    console.log();
  }

  // Summary
  const { summary } = report;
  if (summary.fail > 0) {
    console.log(`\x1b[31m✗ ${summary.fail} failed\x1b[0m, ${summary.warn} warnings, ${summary.ok} passed`);
  } else if (summary.warn > 0) {
    console.log(`\x1b[33m⚠ ${summary.warn} warnings\x1b[0m, ${summary.ok} passed`);
  } else {
    console.log(`\x1b[32m✓ all ${summary.total} checks passed\x1b[0m`);
  }
}
