import type { Container } from "@needle-di/core";
import { TRPCError } from "@trpc/server";

import { createLocalCaller } from "../local-caller.ts";

type TaskCaller = {
  tasks: {
    list(input?: { includeDeleted?: boolean }): Promise<unknown[]>;
    get(input: { id: string }): Promise<unknown>;
    create(input: Record<string, unknown>): Promise<unknown>;
    update(input: Record<string, unknown>): Promise<unknown>;
    delete(input: { id: string }): Promise<unknown>;
  };
};

export interface TasksRunOptions {
  caller?: TaskCaller;
  container?: Container | null;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum tasks

Usage:
  fulcrum tasks list [--include-deleted] [--json]
  fulcrum tasks get <id> [--json]
  fulcrum tasks create --title <title> [--status <status>] [--points <n>] [--json]
  fulcrum tasks update <id> [--title <title>] [--status <status>] [--points <n>] [--json]
  fulcrum tasks delete <id> [--json]
`;

export async function run(argv: readonly string[], opts: TasksRunOptions = {}): Promise<void> {
  const io = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const [verb = "help", ...rest] = argv;

  try {
    switch (verb) {
      case "list": {
        const caller = await resolveCaller(opts);
        return printOutput(await caller.tasks.list(rest.includes("--include-deleted") ? { includeDeleted: true } : undefined), rest, io.print);
      }
      case "get": {
        const caller = await resolveCaller(opts);
        return printOutput(await caller.tasks.get({ id: requiredArg(rest, "get", "<id>") }), rest, io.print);
      }
      case "create": {
        const caller = await resolveCaller(opts);
        return printOutput(await caller.tasks.create(compact({
          title: requiredFlag(rest, "--title"),
          status: flagValue(rest, "--status"),
          points: numberFlag(rest, "--points"),
        })), rest, io.print);
      }
      case "update": {
        const caller = await resolveCaller(opts);
        return printOutput(await caller.tasks.update(compact({
          id: requiredArg(rest, "update", "<id>"),
          title: flagValue(rest, "--title"),
          status: flagValue(rest, "--status"),
          points: numberFlag(rest, "--points"),
        })), rest, io.print);
      }
      case "delete": {
        const caller = await resolveCaller(opts);
        return printOutput(await caller.tasks.delete({ id: requiredArg(rest, "delete", "<id>") }), rest, io.print);
      }
      case "help":
      case "--help":
      case "-h":
        io.print(HELP);
        return;
      default:
        io.printErr(`fulcrum tasks: unknown command '${verb}'`);
        io.printErr(HELP);
        io.exit(2);
    }
  } catch (error) {
    io.printErr(`fulcrum tasks ${verb}: ${errorMessage(error)}`);
    io.exit(1);
  }
}

async function resolveCaller(opts: TasksRunOptions): Promise<TaskCaller> {
  if (opts.caller) return opts.caller;
  return await createLocalCaller({ container: opts.container, requireSession: true }) as unknown as TaskCaller;
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

function numberFlag(argv: readonly string[], flag: string): number | undefined {
  const value = flagValue(argv, flag);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${flag} must be an integer`);
  return parsed;
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function errorMessage(error: unknown): string {
  if (error instanceof TRPCError) return `${error.code}: ${error.message}`;
  return (error as Error).message;
}
