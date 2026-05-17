import {
  createConnectorApiCallerFromEnv,
  type ConnectorApiEnvironment,
} from "@integration-hub/interface/http/connector-api-client.ts";
import { formatApiError } from "./api-errors.ts";

export interface ConnectorSummary {
  kind: string;
  enabled: boolean;
  lastSyncAt: string | null;
}

export interface ConnectorRunSummary {
  id?: string;
  kind: string;
  status: string;
  startedAt?: string | null;
  started_at?: string | null;
  recordsSynced?: number;
  records_synced?: number;
  error?: string | null;
}

type ConnectorsCaller = {
  connectors: {
    list(input?: Record<string, unknown>): Promise<ConnectorSummary[]>;
    runs?: {
      list(input: { kind: string }): Promise<ConnectorRunSummary[]>;
    };
  };
};

export interface ConnectorsRunOptions {
  caller?: ConnectorsCaller;
  env?: ConnectorApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

export function formatConnectorsList(connectors: ConnectorSummary[], json: boolean): string {
  if (json) return JSON.stringify(connectors, null, 2);
  if (connectors.length === 0) return "No connectors configured.";
  return connectors
    .map((c) => `${c.kind}  ${c.enabled ? "ON" : "OFF"}  last-sync: ${c.lastSyncAt ?? "never"}`)
    .join("\n");
}

export function formatConnectorRuns(runs: ConnectorRunSummary[], json: boolean): string {
  if (json) return JSON.stringify(runs, null, 2);
  if (runs.length === 0) return "No runs found.";
  return runs
    .map((r) => {
      const started = r.startedAt ?? r.started_at ?? "unknown";
      const records = r.recordsSynced ?? r.records_synced ?? 0;
      return `${r.kind}  ${r.status}  ${started}  ${records} records  ${r.error ?? ""}`.trimEnd();
    })
    .join("\n");
}

export async function run(argv: readonly string[], opts: ConnectorsRunOptions = {}): Promise<void> {
  const io = ioFor(opts);
  const [sub = "help", ...rest] = argv;
  const isJson = rest.includes("--json");

  try {
    const caller = sub === "help" || sub === "--help" || sub === "-h" ? null : await resolveCaller(opts);
    switch (sub) {
      case "list":
        if (!validateFlags(rest, new Set(["--json"]), io)) return;
        io.print(formatConnectorsList(await caller!.connectors.list({}), isJson));
        return;
      case "runs": {
        if (!validateFlags(rest, new Set(["--json"]), io)) return;
        const kind = rest.find((a) => !a.startsWith("--"));
        if (!kind) {
          io.printErr("usage: fulcrum connectors runs <kind> [--json]");
          io.exit(2);
          return;
        }
        io.print(formatConnectorRuns(await caller!.connectors.runs?.list({ kind }) ?? [], isJson));
        return;
      }
      case "help":
      case "--help":
      case "-h":
        io.print("usage: fulcrum connectors <list|runs> [--json]");
        return;
      default:
        io.printErr("usage: fulcrum connectors <list|runs> [--json]");
        io.exit(2);
    }
  } catch (error) {
    io.printErr(`fulcrum connectors ${sub}: ${errorMessage(error)}`);
    io.exit(1);
  }
}

async function resolveCaller(opts: ConnectorsRunOptions): Promise<ConnectorsCaller> {
  if (opts.caller) return opts.caller;
  const apiCaller = createConnectorApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error("Connector API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return {
    connectors: {
      list: () => apiCaller.connectors.list() as Promise<ConnectorSummary[]>,
      runs: {
        list: (input) => apiCaller.connectors.runs.list({ connectorId: input.kind }) as Promise<ConnectorRunSummary[]>,
      },
    },
  };
}

function ioFor(opts: ConnectorsRunOptions): Required<Pick<ConnectorsRunOptions, "print" | "printErr" | "exit">> {
  return {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
}

function validateFlags(argv: readonly string[], allowed: Set<string>, io: Required<Pick<ConnectorsRunOptions, "printErr" | "exit">>): boolean {
  for (const arg of argv) {
    if (arg.startsWith("--") && !allowed.has(arg)) {
      io.printErr(`unknown flag: ${arg}`);
      io.exit(2);
      return false;
    }
  }
  return true;
}

function errorMessage(error: unknown): string {
  return formatApiError(error);
}
