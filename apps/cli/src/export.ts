import type { Container } from "@needle-di/core";
import { writeFileSync } from "node:fs";

import { createLocalCaller } from "./local-caller.ts";

type ExportCaller = {
  tasks: {
    list(input: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
  };
};

export interface ExportRunOptions {
  caller?: ExportCaller;
  container?: Container | null;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum export

Usage:
  fulcrum export tasks --project <id> --format csv|json [--output <file>]
`;

const CSV_COLUMNS = ["title", "id", "status", "priority", "assignee", "labels", "dueDate", "points"] as const;

export async function run(argv: readonly string[], opts: ExportRunOptions = {}): Promise<void> {
  const io = ioFor(opts);
  const [sub = "help", ...rest] = normalizeLegacyArgs(argv);
  if (sub === "help" || sub === "--help" || sub === "-h") {
    io.print(HELP);
    return;
  }
  if (sub !== "tasks") {
    io.printErr(`fulcrum export: unknown export type '${sub}'. Use: tasks`);
    io.exit(2);
    return;
  }

  const projectId = flagValue(rest, "--project");
  if (!projectId) {
    io.printErr("fulcrum export tasks: --project <id> is required");
    io.exit(2);
    return;
  }

  const format = flagValue(rest, "--format") ?? "json";
  const outputFile = flagValue(rest, "--output");

  try {
    const caller = await resolveCaller(opts);
    const tasks = await caller.tasks.list({ projectId, limit: 10000 });
    const output = format === "csv" ? toCsv(tasks) : JSON.stringify(tasks, null, 2);
    if (outputFile) {
      writeFileSync(outputFile, output, "utf8");
      io.print(`Exported ${tasks.length} tasks to ${outputFile}`);
      return;
    }
    io.print(output);
  } catch (error) {
    io.printErr(`fulcrum export tasks: ${(error as Error).message}`);
    io.exit(1);
  }
}

function normalizeLegacyArgs(argv: readonly string[]): string[] {
  if (flagValue(argv, "--entity") === "tasks") {
    return ["tasks", ...argv.filter((arg, index) => arg !== "--entity" && argv[index - 1] !== "--entity")];
  }
  return [...argv];
}

function toCsv(tasks: Array<Record<string, unknown>>): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const task of tasks) {
    const row = CSV_COLUMNS.map((column) => {
      const value = task[column] ?? "";
      const text = Array.isArray(value) ? value.join(";") : String(value);
      return text.includes(",") ? `"${text.replaceAll("\"", "\"\"")}"` : text;
    });
    lines.push(row.join(","));
  }
  return lines.join("\n");
}

async function resolveCaller(opts: ExportRunOptions): Promise<ExportCaller> {
  if (opts.caller) return opts.caller;
  return await createLocalCaller({ container: opts.container, requireSession: true }) as unknown as ExportCaller;
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("-") ? value : undefined;
}

function ioFor(opts: ExportRunOptions): Required<Pick<ExportRunOptions, "print" | "printErr" | "exit">> {
  return {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
}
