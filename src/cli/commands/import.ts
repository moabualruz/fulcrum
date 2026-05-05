/**
 * fulcrum import — import tasks from external sources.
 *
 * Usage:
 *   fulcrum import csv --project <id> --file <path> [--dry-run] [--json]
 *   fulcrum import jira --project <id> [--dry-run] [--json]
 *   fulcrum import github --project <id> [--dry-run] [--json]
 *   fulcrum import trello --project <id> [--dry-run] [--json]
 *
 * Environment vars for API sources:
 *   FULCRUM_JIRA_TOKEN, FULCRUM_GITHUB_TOKEN, FULCRUM_TRELLO_TOKEN
 */

import { readFileSync } from "node:fs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => Promise<any>;

export interface ImportRunOptions {
  caller?: {
    tasks: {
      bulkCreate: AnyFn;
    };
  };
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

const VALID_SOURCES = ["csv", "jira", "github", "trello"] as const;
type ImportSource = (typeof VALID_SOURCES)[number];

const HELP = `fulcrum import

Import tasks from external sources.

Usage:
  fulcrum import csv --project <id> --file <path> [--dry-run] [--json]
  fulcrum import jira --project <id> [--dry-run] [--json]
  fulcrum import github --project <id> [--dry-run] [--json]
  fulcrum import trello --project <id> [--dry-run] [--json]

Options:
  --project <id>   Target project ID (required)
  --file <path>    Input file path (required for csv)
  --dry-run        Preview import without creating tasks
  --json           Output as JSON
`;

export async function run(argv: readonly string[], opts: ImportRunOptions = {}): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;
  const [source, ...rest] = argv;

  if (!source || source === "--help" || source === "-h") {
    print(HELP);
    return;
  }

  if (!VALID_SOURCES.includes(source as ImportSource)) {
    printErr(`fulcrum import: unknown source '${source}'`);
    printErr("Valid sources: " + VALID_SOURCES.join(", "));
    exit(2);
    return;
  }

  const projectIdx = rest.indexOf("--project");
  const projectId = projectIdx >= 0 ? rest[projectIdx + 1] : undefined;
  if (!projectId) {
    printErr("fulcrum import: --project <id> is required");
    exit(2);
    return;
  }

  const fileIdx = rest.indexOf("--file");
  const filePath = fileIdx >= 0 ? rest[fileIdx + 1] : undefined;
  const dryRun = rest.includes("--dry-run");
  const jsonMode = rest.includes("--json");

  try {
    let tasks: ImportedTask[] = [];

    if (source === "csv") {
      if (!filePath) {
        printErr("fulcrum import csv: --file <path> is required");
        exit(2);
        return;
      }
      tasks = parseCsv(filePath);
    } else {
      // API-based sources — prompt user or read from env
      const tokenEnvKey = `FULCRUM_${source.toUpperCase()}_TOKEN`;
      const token = process.env[tokenEnvKey];
      if (!token) {
        printErr(`fulcrum import ${source}: set ${tokenEnvKey} environment variable to authenticate`);
        exit(1);
        return;
      }
      printErr(`fulcrum import ${source}: API-based import not implemented in this release`);
      printErr(`Use csv export from ${source} and import with: fulcrum import csv --file <path>`);
      exit(1);
      return;
    }

    if (tasks.length === 0) {
      print("No tasks found to import.");
      return;
    }

    if (dryRun) {
      if (jsonMode) {
        print(JSON.stringify({ dryRun: true, count: tasks.length, tasks }, null, 2));
      } else {
        print(`\nDry run — would import ${tasks.length} tasks into ${projectId}:`);
        for (const task of tasks.slice(0, 10)) {
          print(`  - ${task.title} [${task.status ?? "todo"}]`);
        }
        if (tasks.length > 10) print(`  ... and ${tasks.length - 10} more`);
      }
      return;
    }

    const caller = await resolveCaller(opts);
    let imported = 0;
    const batchSize = 25;

    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      await caller.tasks.bulkCreate({ projectId, tasks: batch });
      imported += batch.length;
      if (!jsonMode) {
        print(`Imported ${imported}/${tasks.length} tasks...`);
      }
    }

    if (jsonMode) {
      print(JSON.stringify({ imported, projectId }));
    } else {
      print(`\nImport complete: ${imported} tasks added to ${projectId}`);
    }
  } catch (err) {
    printErr(`fulcrum import: ${(err as Error).message}`);
    exit(1);
  }
}

function parseCsv(filePath: string): ImportedTask[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headerLine = lines[0]!;
  const headers = headerLine.split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, "_"));

  const CSV_COLUMN_MAP: Record<string, keyof ImportedTask> = {
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
    if (!line.trim()) continue;
    const values = splitCsvRow(line);
    const task: ImportedTask = { title: "" };
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i]!;
      const field = CSV_COLUMN_MAP[header];
      if (field && values[i]) {
        (task as unknown as Record<string, string>)[field] = values[i]!.trim();
      }
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
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function resolveCaller(opts: ImportRunOptions): Promise<Required<ImportRunOptions>["caller"]> {
  if (opts.caller) return opts.caller;

  const { t } = await import("../../trpc/trpc.ts");
  const { appRouter } = await import("../../trpc/router.ts");
  const { createContext } = await import("../../trpc/context.ts");
  const { MikroORM } = await import("@mikro-orm/postgresql");
  const { Container } = await import("@needle-di/core");
  const { registerDbBindings } = await import("../../db/db.module.ts");

  const orm = new MikroORM({} as never);
  const container = new Container();
  container.bind({ provide: MikroORM, useValue: orm });
  const em = orm.em.fork();
  registerDbBindings(container, orm, em);

  const ctx = createContext({ session: null as never, orgId: "", userId: "", em, container });
  const factory = t.createCallerFactory(appRouter);
  return factory(ctx) as unknown as Required<ImportRunOptions>["caller"];
}
