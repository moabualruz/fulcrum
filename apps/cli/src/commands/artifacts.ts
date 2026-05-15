import { formatApiError } from "../api-errors.ts";
import {
  createArtifactApiCallerFromEnv,
  type ArtifactApiEnvironment,
} from "@workflow-coordination/interface/http/artifact-api-client.ts";

type ArtifactsCaller = {
  artifacts: {
    list(input: Record<string, unknown>): Promise<unknown[]>;
    get(input: { id: string }): Promise<unknown>;
    download(input: { id: string }): Promise<unknown>;
    archive(input: { id: string }): Promise<unknown>;
    unarchive(input: { id: string }): Promise<unknown>;
    delete(input: { id: string; hard?: boolean }): Promise<unknown>;
  };
};

export interface ArtifactsRunOptions {
  caller?: ArtifactsCaller;
  env?: ArtifactApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum artifacts

Usage:
  fulcrum artifacts list [--project-id <id>] [--run-id <id>] [--task-id <id>] [--archived] [--mime <type>] [--json]
  fulcrum artifacts show <id> [--json]
  fulcrum artifacts download <id> [--json]
  fulcrum artifacts archive <id> [--json]
  fulcrum artifacts unarchive <id> [--json]
  fulcrum artifacts delete <id> [--hard] [--json]
`;

export async function run(argv: readonly string[], opts: ArtifactsRunOptions = {}): Promise<void> {
  const io = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const [verb = "help", ...rest] = argv;

  try {
    const caller = verb === "help" || verb === "--help" || verb === "-h" ? null : await resolveCaller(opts);
    switch (verb) {
      case "list":
        return printOutput(await caller!.artifacts.list(compact({
          projectId: flagValue(rest, "--project-id"),
          runId: flagValue(rest, "--run-id"),
          taskId: flagValue(rest, "--task-id"),
          archived: rest.includes("--archived") ? true : undefined,
          mime: flagValue(rest, "--mime"),
        })), rest, io.print);
      case "show":
        return printOutput(await caller!.artifacts.get({ id: requiredArg(rest, "show", "<id>") }), rest, io.print);
      case "download":
        return printOutput(await caller!.artifacts.download({ id: requiredArg(rest, "download", "<id>") }), rest, io.print);
      case "archive":
        return printOutput(await caller!.artifacts.archive({ id: requiredArg(rest, "archive", "<id>") }), rest, io.print);
      case "unarchive":
        return printOutput(await caller!.artifacts.unarchive({ id: requiredArg(rest, "unarchive", "<id>") }), rest, io.print);
      case "delete":
        return printOutput(await caller!.artifacts.delete({
          id: requiredArg(rest, "delete", "<id>"),
          hard: rest.includes("--hard") || undefined,
        }), rest, io.print);
      case "help":
      case "--help":
      case "-h":
        io.print(HELP);
        return;
      default:
        io.printErr(`fulcrum artifacts: unknown command '${verb}'`);
        io.printErr(HELP);
        io.exit(2);
    }
  } catch (error) {
    io.printErr(`fulcrum artifacts ${verb}: ${errorMessage(error)}`);
    io.exit(1);
  }
}

async function resolveCaller(opts: ArtifactsRunOptions): Promise<ArtifactsCaller> {
  if (opts.caller) return opts.caller;
  const apiCaller = createArtifactApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error("Artifact API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return apiCaller as ArtifactsCaller;
}

function printOutput(value: unknown, argv: readonly string[], print: (line: string) => void): void {
  print(argv.includes("--json") ? JSON.stringify(value) : JSON.stringify(value, null, 2));
}

function requiredArg(argv: readonly string[], command: string, label: string): string {
  const value = argv.find((arg) => !arg.startsWith("-"));
  if (!value) throw new Error(`missing required argument ${label} for ${command}`);
  return value;
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("-") ? value : undefined;
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function errorMessage(error: unknown): string {
  return formatApiError(error);
}
