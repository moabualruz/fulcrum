/**
 * fulcrum report — report subcommands.
 *
 * Usage:
 *   fulcrum report burndown --project <id> [--format json|table|csv]
 *   fulcrum report velocity --project <id> [--format json|table|csv]
 *   fulcrum report throughput --project <id> [--format json|table|csv]
 *   fulcrum report cycle-time --project <id> [--format json|table|csv]
 *   fulcrum report cfd --project <id> [--format json|table|csv]
 *   fulcrum report lead-time --project <id> [--format json|table|csv]
 *   fulcrum report wip --project <id> [--format json|table|csv]
 *   fulcrum report workload --project <id> [--format json|table|csv]
 *   fulcrum report blocked --project <id> [--format json|table|csv]
 *   fulcrum report stale --project <id> [--format json|table|csv]
 *   fulcrum report progress --project <id> [--format json|table|csv]
 *   fulcrum report burnup --project <id> [--format json|table|csv]
 *
 * Options:
 *   --project <id>     Project scope
 *   --sprint <id>      Sprint scope
 *   --workspace        Workspace-wide scope
 *   --format           json|table|csv (default: table)
 *   --json             Shortcut for --format json
 *   --days <n>         Date range in days
 */

import {
  createReportApiCallerFromEnv,
  type ReportApiEnvironment,
} from "@work-management/interface/http/report-api-client.ts";
import { emitErrorResult, emitResult } from "../lib/cli-output.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;
type ReportsCaller = { reports: Record<string, (...args: unknown[]) => Promise<unknown>> };

export interface ReportRunOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  caller?: { reports: Record<string, (...args: any[]) => Promise<any>> };
  env?: ReportApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const REPORT_TYPES = [
  "burndown", "burnup", "velocity", "cfd", "cycle-time", "lead-time",
  "throughput", "wip", "workload", "blocked", "stale", "progress",
] as const;

type ReportType = (typeof REPORT_TYPES)[number];

const HELP = `fulcrum report

Report subcommands.

Usage:
  fulcrum report list [--json]
  fulcrum report <type> [--project <id>] [--sprint <id>] [--format json|table|csv] [--days <n>]

Types:
  burndown, burnup, velocity, cfd, cycle-time, lead-time,
  throughput, wip, workload, blocked, stale, progress

Options:
  --project <id>    Project scope
  --sprint <id>     Sprint scope
  --workspace       Workspace scope
  --format          json|table|csv (default: table)
  --json            Shortcut for --format json
  --days <n>        Date range in days
  -h, --help        Show this help
`;

export async function run(argv: readonly string[], opts: ReportRunOptions = {}): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;
  const [type = "help", ...rest] = argv;

  if (type === "help" || type === "--help" || type === "-h") {
    print(HELP);
    return;
  }

  if (type === "list") {
    emitErrorResult(
      {
        argv,
        command: "fulcrum report list",
        args: {},
        error: {
          code: "FUL_NOT_IMPLEMENTED",
          message: "fulcrum report list is reserved for the report catalog PRD.",
          fix: "Use a concrete report type such as `fulcrum report burndown --json`.",
        },
        renderHuman: () => printErr("fulcrum report list is not implemented yet."),
      },
      { print, printErr },
    );
    exit(1);
    return;
  }

  if (!REPORT_TYPES.includes(type as ReportType)) {
    printErr(`fulcrum report: unknown report type '${type}'`);
    printErr(`Valid types: ${REPORT_TYPES.join(", ")}`);
    exit(2);
    return;
  }

  // Parse options
  const jsonFlag = rest.includes("--json");
  const formatIdx = rest.indexOf("--format");
  const formatArg = formatIdx >= 0 ? rest[formatIdx + 1] : undefined;
  const format = jsonFlag ? "json" : (formatArg ?? "table");

  const projectIdx = rest.indexOf("--project");
  const projectId = projectIdx >= 0 ? rest[projectIdx + 1] : undefined;

  const sprintIdx = rest.indexOf("--sprint");
  const sprintId = sprintIdx >= 0 ? rest[sprintIdx + 1] : undefined;

  const daysIdx = rest.indexOf("--days");
  const days = daysIdx >= 0 ? Number(rest[daysIdx + 1]) : undefined;

  try {
    const caller = await resolveCaller(opts);
    const procedureName = typeToProcedure(type as ReportType);
    const procedure = caller.reports[procedureName];

    if (!procedure) {
      // Compatibility fallback for report types without a runtime procedure.
      const data: AnyRecord[] = [];
      outputData(data, format, type as ReportType, print, rest);
      return;
    }

    const data = await procedure({ projectId, sprintId, days });
    outputData(data, format, type as ReportType, print, rest);
  } catch (err) {
    emitErrorResult(
      {
        argv,
        command: `fulcrum report ${type}`,
        args: { projectId, sprintId, days },
        error: {
          code: "FUL_REPORT_ERROR",
          message: `fulcrum report ${type}: ${(err as Error).message}`,
          fix: "Configure the Fulcrum report API environment, then retry.",
        },
        renderHuman: () => printErr(`fulcrum report ${type}: ${(err as Error).message}`),
      },
      { print, printErr },
    );
    exit(1);
  }
}

function typeToProcedure(type: ReportType): string {
  const map: Record<ReportType, string> = {
    "burndown": "burndown",
    "burnup": "burnup",
    "velocity": "velocity",
    "cfd": "cfd",
    "cycle-time": "cycleTime",
    "lead-time": "leadTime",
    "throughput": "throughput",
    "wip": "wip",
    "workload": "workload",
    "blocked": "blocked",
    "stale": "stale",
    "progress": "progress",
  };
  return map[type];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function outputData(data: any, format: string, type: ReportType, print: (line: string) => void, argv: readonly string[]): void {
  if (format === "json") {
    if (!argv.includes("--json")) {
      print(JSON.stringify(data, null, 2));
      return;
    }
    emitResult(
      {
        argv,
        command: `fulcrum report ${type}`,
        args: {},
        result: data,
        renderHuman: (value) => print(JSON.stringify(value, null, 2)),
      },
      { print, printErr: print },
    );
    return;
  }

  if (format === "csv") {
    const rows = Array.isArray(data) ? data : [data];
    if (rows.length === 0) return;
    const keys = Object.keys(rows[0] as AnyRecord);
    print(keys.join(","));
    for (const row of rows as AnyRecord[]) {
      print(keys.map((k) => String(row[k] ?? "")).join(","));
    }
    return;
  }

  // table format
  print(`\nReport: ${type}`);
  print("─".repeat(60));

  const rows = Array.isArray(data) ? data : [data];
  if (rows.length === 0) {
    print("  (no data)");
    return;
  }

  const keys = Object.keys(rows[0] as AnyRecord);
  const colWidths = keys.map((k) => Math.max(k.length, ...rows.map((r) => String((r as AnyRecord)[k] ?? "").length)));
  const header = keys.map((k, i) => k.padEnd(colWidths[i]!)).join("  ");
  print("  " + header);
  print("  " + colWidths.map((w) => "─".repeat(w)).join("  "));
  for (const row of rows as AnyRecord[]) {
    const line = keys.map((k, i) => String((row as AnyRecord)[k] ?? "").padEnd(colWidths[i]!)).join("  ");
    print("  " + line);
  }
}

async function resolveCaller(opts: ReportRunOptions): Promise<ReportsCaller> {
  if (opts.caller) return opts.caller;

  const apiCaller = createReportApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error("Report API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL and FULCRUM_ORG_ID.");
  }
  return apiCaller as ReportsCaller;
}
