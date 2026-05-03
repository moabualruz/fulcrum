import { writeFile } from "node:fs/promises";
import {
  flagIso,
  flagNumber,
  flagString,
  hasFlag,
  parseArgs,
  printJson,
} from "./arg-parser.ts";
import { callProcedure } from "./trpc-client.ts";

export interface AuditFilters {
  project?: string;
  user?: string;
  kind?: string;
  verb?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export type AuditExportResult =
  | { format: "csv" | "json"; content: string }
  | { jobId: string };

export type AuditExportStatus =
  | { status: "queued" | "running" }
  | { status: "completed"; format: "csv" | "json"; content: string }
  | { status: "failed"; error?: string };

export interface AuditClient {
  query(input: AuditFilters): Promise<unknown[]>;
  export(input: AuditFilters & { format: "csv" | "json" }): Promise<AuditExportResult>;
  exportStatus(jobId: string): Promise<AuditExportStatus>;
}

interface RunOptions {
  client?: AuditClient;
  sleep?: (ms: number) => Promise<void>;
}

const HELP = `fulcrum audit

Usage:
  fulcrum audit query [--project <id>] [--user <id>] [--kind <kind>] [--verb <verb>] [--since <ISO>] [--until <ISO>] [--limit <n>] [--json]
  fulcrum audit export --format csv|json [same filters] [--output <file>]
`;

const BOOLEAN_FLAGS = new Set(["--json"]);

function defaultClient(): AuditClient {
  return {
    query: (input) => callProcedure("audit.query", input),
    export: (input) => callProcedure("audit.export", input),
    exportStatus: (jobId) => callProcedure("audit.exportStatus", { jobId }),
  };
}

export async function run(argv: readonly string[], options: RunOptions = {}): Promise<void> {
  const [verb, ...rest] = argv;
  if (!verb || verb === "help" || verb === "--help" || verb === "-h") {
    console.log(HELP);
    return;
  }
  const client = options.client ?? defaultClient();
  switch (verb) {
    case "query":
      return runQuery(rest, client);
    case "export":
      return runExport(rest, client, options.sleep ?? sleep);
    default:
      throw new Error(`unknown audit verb: ${verb}`);
  }
}

async function runQuery(argv: readonly string[], client: AuditClient): Promise<void> {
  const parsed = parseArgs(argv, BOOLEAN_FLAGS);
  const rows = await client.query(filters(parsed));
  if (hasFlag(parsed, "json")) printJson(rows);
  else for (const row of rows) console.log(JSON.stringify(row));
}

async function runExport(
  argv: readonly string[],
  client: AuditClient,
  wait: (ms: number) => Promise<void>,
): Promise<void> {
  const parsed = parseArgs(argv, BOOLEAN_FLAGS);
  const format = flagString(parsed, "format");
  if (format !== "csv" && format !== "json") throw new Error("--format must be csv or json");
  let result = await client.export({ ...filters(parsed), format });
  while ("jobId" in result) {
    const status = await client.exportStatus(result.jobId);
    if (status.status === "failed") throw new Error(status.error ?? "audit export failed");
    if (status.status === "completed") {
      result = { format: status.format, content: status.content };
      break;
    }
    await wait(2000);
  }
  await writeOutput(result.content, flagString(parsed, "output"));
}

function filters(parsed: ReturnType<typeof parseArgs>): AuditFilters {
  return compact({
    project: flagString(parsed, "project"),
    user: flagString(parsed, "user"),
    kind: flagString(parsed, "kind"),
    verb: flagString(parsed, "verb"),
    since: flagIso(parsed, "since"),
    until: flagIso(parsed, "until"),
    limit: flagNumber(parsed, "limit"),
  });
}

function compact<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

async function writeOutput(content: string, output: string | undefined): Promise<void> {
  if (output) {
    await writeFile(output, content);
  } else {
    console.log(content);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
