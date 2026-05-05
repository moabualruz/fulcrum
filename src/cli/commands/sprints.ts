import type { Container } from "@needle-di/core";
import { TRPCError } from "@trpc/server";

import { createLocalCaller } from "../local-caller.ts";

type SprintsCaller = {
  sprints: {
    list(input?: Record<string, unknown>): Promise<unknown[]>;
    get(input: { id: string }): Promise<unknown>;
    create(input: Record<string, unknown>): Promise<unknown>;
    update(input: Record<string, unknown>): Promise<unknown>;
    delete(input: { id: string }): Promise<unknown>;
    addTask(input: { sprintId: string; taskId: string }): Promise<unknown>;
    removeTask(input: { sprintId: string; taskId: string }): Promise<unknown>;
  };
};

export interface SprintsRunOptions {
  caller?: SprintsCaller;
  container?: Container | null;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum sprints

Usage:
  fulcrum sprints list [--project <id>] [--status <planned|active|completed>] [--json]
  fulcrum sprints get <id> [--json]
  fulcrum sprints create --project <id> --name <name> --start <iso> --end <iso> [--goal <text>] [--capacity <n>] [--json]
  fulcrum sprints update <id> [--name <name>] [--goal <text>] [--start <iso>] [--end <iso>] [--capacity <n>] [--json]
  fulcrum sprints delete <id> [--json]
  fulcrum sprints add-task --sprint-id <id> --task-id <id> [--json]
  fulcrum sprints remove-task --sprint-id <id> --task-id <id> [--json]
`;

export async function run(argv: readonly string[], opts: SprintsRunOptions = {}): Promise<void> {
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
        return printOutput(await caller!.sprints.list(compact({
          projectId: flagValue(rest, "--project"),
          status: flagValue(rest, "--status"),
        })), rest, io.print);
      case "get":
        return printOutput(await caller!.sprints.get({ id: requiredArg(rest, "get", "<id>") }), rest, io.print);
      case "create":
        return printOutput(await caller!.sprints.create(compact({
          projectId: requiredFlag(rest, "--project"),
          name: requiredFlag(rest, "--name"),
          goal: flagValue(rest, "--goal"),
          startDate: dateFlag(rest, "--start", true),
          endDate: dateFlag(rest, "--end", true),
          capacityPoints: numberFlag(rest, "--capacity"),
        })), rest, io.print);
      case "update":
        return printOutput(await caller!.sprints.update(compact({
          id: requiredArg(rest, "update", "<id>"),
          name: flagValue(rest, "--name"),
          goal: flagValue(rest, "--goal"),
          startDate: dateFlag(rest, "--start", false),
          endDate: dateFlag(rest, "--end", false),
          capacityPoints: numberFlag(rest, "--capacity"),
        })), rest, io.print);
      case "delete":
        return printOutput(await caller!.sprints.delete({ id: requiredArg(rest, "delete", "<id>") }), rest, io.print);
      case "add-task":
        return printOutput(await caller!.sprints.addTask({
          sprintId: requiredFlag(rest, "--sprint-id"),
          taskId: requiredFlag(rest, "--task-id"),
        }), rest, io.print);
      case "remove-task":
        return printOutput(await caller!.sprints.removeTask({
          sprintId: requiredFlag(rest, "--sprint-id"),
          taskId: requiredFlag(rest, "--task-id"),
        }), rest, io.print);
      case "help":
      case "--help":
      case "-h":
        io.print(HELP);
        return;
      default:
        io.printErr(`fulcrum sprints: unknown command '${verb}'`);
        io.printErr(HELP);
        io.exit(2);
    }
  } catch (error) {
    io.printErr(`fulcrum sprints ${verb}: ${errorMessage(error)}`);
    io.exit(1);
  }
}

async function resolveCaller(opts: SprintsRunOptions): Promise<SprintsCaller> {
  if (opts.caller) return opts.caller;
  return await createLocalCaller({ container: opts.container, requireSession: true }) as unknown as SprintsCaller;
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

function dateFlag(argv: readonly string[], flag: string, required: boolean): Date | undefined {
  const value = required ? requiredFlag(argv, flag) : flagValue(argv, flag);
  return value ? new Date(value) : undefined;
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
