/**
 * fulcrum export — export tasks to various formats.
 *
 * Usage:
 *   fulcrum export tasks --project <id> --format csv|json [--output <file>]
 *   fulcrum export tasks --project <id> --format csv > tasks.csv
 */

import { writeFileSync } from "node:fs";

import {
  createTaskApiCallerFromEnv,
  type TaskApiEnvironment,
} from "@work-management/interface/http/task-api-client.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => Promise<any>;

export interface ExportRunOptions {
  caller?: {
    tasks: {
      list: AnyFn;
    };
    reports?: {
      exportCsv?: AnyFn;
    };
  };
  env?: TaskApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum export

Export tasks to various formats.

Usage:
  fulcrum export tasks --project <id> --format csv|json [--output <file>]

Options:
  --project <id>   Source project ID (required)
  --format         csv|json (default: json)
  --output <file>  Write to file instead of stdout
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TaskRecord = Record<string, any>;

const CSV_COLUMNS = ["title", "id", "status", "priority", "assignee", "labels", "dueDate", "points"] as const;

export async function run(argv: readonly string[], opts: ExportRunOptions = {}): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;
  const [sub, ...rest] = argv;

  if (!sub || sub === "--help" || sub === "-h") {
    print(HELP);
    return;
  }

  if (sub !== "tasks") {
    printErr(`fulcrum export: unknown export type '${sub}'. Use: tasks`);
    exit(2);
    return;
  }

  const projectIdx = rest.indexOf("--project");
  const projectId = projectIdx >= 0 ? rest[projectIdx + 1] : undefined;
  if (!projectId) {
    printErr("fulcrum export tasks: --project <id> is required");
    exit(2);
    return;
  }

  const formatIdx = rest.indexOf("--format");
  const format = formatIdx >= 0 ? (rest[formatIdx + 1] ?? "json") : "json";
  const outputIdx = rest.indexOf("--output");
  const outputFile = outputIdx >= 0 ? rest[outputIdx + 1] : undefined;

  try {
    const caller = await resolveCaller(opts);
    const tasks: TaskRecord[] = await caller.tasks.list({ projectId, limit: 10000 });

    let output = "";

    if (format === "csv") {
      const lines: string[] = [CSV_COLUMNS.join(",")];
      for (const task of tasks) {
        const row = CSV_COLUMNS.map((col) => {
          const value = task[col] ?? "";
          const str = Array.isArray(value) ? value.join(";") : String(value);
          return str.includes(",") ? `"${str}"` : str;
        });
        lines.push(row.join(","));
      }
      output = lines.join("\n");
    } else {
      output = JSON.stringify(tasks, null, 2);
    }

    if (outputFile) {
      writeFileSync(outputFile, output, "utf-8");
      print(`Exported ${tasks.length} tasks to ${outputFile}`);
    } else {
      print(output);
    }
  } catch (err) {
    printErr(`fulcrum export tasks: ${(err as Error).message}`);
    exit(1);
  }
}

async function resolveCaller(opts: ExportRunOptions): Promise<Required<ExportRunOptions>["caller"]> {
  if (opts.caller) return opts.caller;
  const apiCaller = createTaskApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error("Task API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.");
  }
  return apiCaller as unknown as Required<ExportRunOptions>["caller"];
}
