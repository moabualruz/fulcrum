import { readFileSync } from "node:fs";

import {
  createTaskApiCallerFromEnv,
  type TaskApiEnvironment,
} from "@work-management/interface/http/task-api-client.ts";

type ImportCaller = {
  tasks: {
    bulkCreate?: (input: { projectId: string; tasks: ImportedTask[] }) => Promise<unknown>;
    importCsv?: (input: { projectId: string; csv: string }) => Promise<unknown>;
  };
};

export interface ImportRunOptions {
  caller?: ImportCaller;
  env?: TaskApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

interface ImportedTask {
  title: string;
  status?: string;
  priority?: string;
  assignee?: string;
  description?: string;
  dueDate?: string;
  externalId?: string;
}

const VALID_SOURCES = ["csv", "jira", "github", "trello", "linear", "plane"] as const;

const HELP = `fulcrum import

Usage:
  fulcrum import csv --project <id> --file <path> [--dry-run] [--json]
  fulcrum import jira --project <id> [--dry-run] [--json]
  fulcrum import github --project <id> [--dry-run] [--json]
  fulcrum import trello --project <id> [--dry-run] [--json]
`;

export async function run(argv: readonly string[], opts: ImportRunOptions = {}): Promise<void> {
  const io = ioFor(opts);
  const [source = "help", ...rest] = normalizeLegacyCsvArgs(argv);
  if (source === "help" || source === "--help" || source === "-h") {
    io.print(HELP);
    return;
  }
  if (!VALID_SOURCES.includes(source as never)) {
    io.printErr(`fulcrum import: unknown source '${source}'`);
    io.exit(2);
    return;
  }

  const projectId = flagValue(rest, "--project");
  if (!projectId) {
    io.printErr("fulcrum import: --project <id> is required");
    io.exit(2);
    return;
  }

  const dryRun = rest.includes("--dry-run");
  const jsonMode = rest.includes("--json");

  try {
    if (source !== "csv") {
      io.printErr(`fulcrum import ${source}: API-based import not implemented in this release`);
      io.exit(1);
      return;
    }

    const filePath = flagValue(rest, "--file") ?? flagValue(rest, "--input");
    if (!filePath) {
      io.printErr("fulcrum import csv: --file <path> is required");
      io.exit(2);
      return;
    }

    const csv = readFileSync(filePath, "utf8");
    const tasks = parseCsvContent(csv);
    if (dryRun) {
      if (jsonMode) io.print(JSON.stringify({ dryRun: true, count: tasks.length, tasks }, null, 2));
      else io.print(`Dry run - would import ${tasks.length} tasks into ${projectId}`);
      return;
    }

    const caller = await resolveCaller(opts);
    if (caller.tasks.importCsv) await caller.tasks.importCsv({ projectId, csv });
    else if (caller.tasks.bulkCreate) await caller.tasks.bulkCreate({ projectId, tasks });
    else throw new Error("task import operation is not available.");
    if (jsonMode) io.print(JSON.stringify({ imported: tasks.length, projectId }));
    else io.print(`Import complete: ${tasks.length} tasks added to ${projectId}`);
  } catch (error) {
    io.printErr(`fulcrum import: ${(error as Error).message}`);
    io.exit(1);
  }
}

function normalizeLegacyCsvArgs(argv: readonly string[]): string[] {
  if (argv.includes("--format") && flagValue(argv, "--format") === "csv") {
    const next = argv.filter((arg, index) => arg !== "--format" && argv[index - 1] !== "--format");
    return ["csv", ...next];
  }
  return [...argv];
}

function parseCsvContent(content: string): ImportedTask[] {
  const lines = content.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = lines[0]!.split(",").map((header) => header.trim().toLowerCase().replace(/[^a-z_]/g, "_"));
  const map: Record<string, keyof ImportedTask> = {
    title: "title",
    name: "title",
    summary: "title",
    status: "status",
    state: "status",
    priority: "priority",
    assignee: "assignee",
    assigned_to: "assignee",
    description: "description",
    body: "description",
    due_date: "dueDate",
    due: "dueDate",
    external_id: "externalId",
    id: "externalId",
  };
  const tasks: ImportedTask[] = [];
  for (const line of lines.slice(1)) {
    const values = splitCsvRow(line);
    const task: ImportedTask = { title: "" };
    for (let i = 0; i < headers.length; i++) {
      const field = map[headers[i]!];
      if (field && values[i]) (task as unknown as Record<string, string>)[field] = values[i]!.trim();
    }
    if (task.title) tasks.push(task);
  }
  return tasks;
}

function splitCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === "\"") inQuotes = !inQuotes;
    else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else current += char;
  }
  result.push(current);
  return result;
}

async function resolveCaller(opts: ImportRunOptions): Promise<ImportCaller> {
  if (opts.caller) return opts.caller;
  const apiCaller = createTaskApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error("Task API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.");
  }
  return apiCaller as unknown as ImportCaller;
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("-") ? value : undefined;
}

function ioFor(opts: ImportRunOptions): Required<Pick<ImportRunOptions, "print" | "printErr" | "exit">> {
  return {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
}
