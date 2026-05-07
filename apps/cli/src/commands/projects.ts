import type { Container } from "@needle-di/core";
import { TRPCError } from "@trpc/server";

import { createLocalCaller } from "../local-caller.ts";

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
  container?: Container | null;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum projects

Usage:
  fulcrum projects list [--json]
  fulcrum projects get <id> [--json]
  fulcrum projects create --name <name> [--json]
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
        return printOutput(await caller!.projects.create({ name: requiredFlag(rest, "--name") }), rest, io.print);
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
  return await createLocalCaller({ container: opts.container, requireSession: true }) as unknown as ProjectsCaller;
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
  if (error instanceof TRPCError) return `${error.code}: ${error.message}`;
  return (error as Error).message;
}
