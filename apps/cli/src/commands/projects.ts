import { formatApiError } from "../api-errors.ts";
import {
  createProjectApiCallerFromEnv,
  type ProjectApiEnvironment,
} from "@work-management/interface/http/project-api-client.ts";

type ProjectsCaller = {
  projects: {
    list(input?: Record<string, unknown>): Promise<unknown[]>;
    get(input: { id: string }): Promise<unknown>;
    create(input: Record<string, unknown>): Promise<unknown>;
    update(input: Record<string, unknown>): Promise<unknown>;
    delete(input: { id: string }): Promise<unknown>;
    stats(input: { id: string }): Promise<unknown>;
  };
};

export interface ProjectsRunOptions {
  caller?: ProjectsCaller;
  env?: ProjectApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum projects

Usage:
  fulcrum projects list [--json]
  fulcrum projects get <id> [--json]
  fulcrum projects create --name <name> [--repo-path <path>] [--template <id>] [--parent <id>] [--json]
  fulcrum projects update <id> [--name <name>] [--json]
  fulcrum projects delete <id> [--json]
  fulcrum projects stats <id> [--json]
`;

export async function run(argv: readonly string[], opts: ProjectsRunOptions = {}): Promise<void> {
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
        return printOutput(await caller!.projects.list({}), rest, io.print);
      case "get":
        return printOutput(await caller!.projects.get({ id: requiredArg(rest, "get", "<id>") }), rest, io.print);
      case "create":
        return printOutput(await caller!.projects.create(compact({
          name: requiredFlag(rest, "--name"),
          repoPath: flagValue(rest, "--repo-path"),
          template: flagValue(rest, "--template"),
          parentId: flagValue(rest, "--parent"),
        })), rest, io.print);
      case "update":
        return printOutput(await caller!.projects.update(compact({
          id: requiredArg(rest, "update", "<id>"),
          name: flagValue(rest, "--name"),
        })), rest, io.print);
      case "delete":
        return printOutput(await caller!.projects.delete({ id: requiredArg(rest, "delete", "<id>") }), rest, io.print);
      case "stats":
        return printOutput(await caller!.projects.stats({ id: requiredArg(rest, "stats", "<id>") }), rest, io.print);
      case "help":
      case "--help":
      case "-h":
        io.print(HELP);
        return;
      default:
        io.printErr(`fulcrum projects: unknown command '${verb}'`);
        io.printErr(HELP);
        io.exit(2);
    }
  } catch (error) {
    io.printErr(`fulcrum projects ${verb}: ${errorMessage(error)}`);
    io.exit(1);
  }
}

async function resolveCaller(opts: ProjectsRunOptions): Promise<ProjectsCaller> {
  if (opts.caller) return opts.caller;
  const apiCaller = createProjectApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error("Project API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL plus FULCRUM_ORG_ID.");
  }
  return {
    projects: {
      list: async () => await apiCaller.projects.list() as unknown[],
      get: async (input) => await apiCaller.projects.get(input),
      create: async (input) => await apiCaller.projects.create(input),
      update: async (input) => await apiCaller.projects.update(input as Record<string, unknown> & { id: string }),
      delete: async (input) => await apiCaller.projects.delete(input),
      stats: async (input) => await apiCaller.projects.stats(input),
    },
  };
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

function requiredFlag(argv: readonly string[], flag: string): string {
  const value = flagValue(argv, flag);
  if (!value) throw new Error(`missing required flag ${flag}`);
  return value;
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function errorMessage(error: unknown): string {
  return formatApiError(error);
}
