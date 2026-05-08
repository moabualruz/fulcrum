import type { Container } from "@needle-di/core";
import { TRPCError } from "@trpc/server";

import { createLocalCaller } from "../local-caller.ts";

type WorkCaller = {
  work?: {
    create?(input: Record<string, unknown>): Promise<unknown>;
    inspect?(input: { id: string; mode?: string }): Promise<unknown>;
    move?(input: Record<string, unknown>): Promise<unknown>;
    link?(input: Record<string, unknown>): Promise<unknown>;
    report?(input: Record<string, unknown>): Promise<unknown>;
  };
  tasks?: {
    create(input: Record<string, unknown>): Promise<unknown>;
  };
};

export interface WorkRunOptions {
  caller?: WorkCaller;
  container?: Container | null;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum work

Usage:
  fulcrum work create --title <title> [--type <type>] [--parent <id>] [--cycle <id>] [--module <id>] [--project <id>] [--json]
  fulcrum work inspect <id> [--mode <planning|docs|repo-workspace|agent-run|knowledge|audit-activity>] [--json]
  fulcrum work move <id> --status <status> [--json]
  fulcrum work link <id> --to <id> --type <type> [--json]
  fulcrum work report [--project <id>] [--json]
`;

export async function run(argv: readonly string[], opts: WorkRunOptions = {}): Promise<void> {
  const io = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const [verb = "help", ...rest] = argv;

  try {
    switch (verb) {
      case "create": {
        const caller = await resolveCaller(opts);
        const input = compact({
          title: requiredFlag(rest, "--title"),
          taskType: flagValue(rest, "--type"),
          parentId: flagValue(rest, "--parent"),
          cycleId: flagValue(rest, "--cycle"),
          moduleId: flagValue(rest, "--module"),
          projectId: flagValue(rest, "--project"),
        });
        return printOutput(await createWork(caller, input), rest, io.print);
      }
      case "inspect": {
        const caller = await resolveCaller(opts);
        return printOutput(await inspectWork(caller, {
          id: requiredArg(rest, "inspect", "<id>"),
          mode: flagValue(rest, "--mode"),
        }), rest, io.print);
      }
      case "move":
      case "link":
      case "report": {
        const caller = await resolveCaller(opts);
        const fn = caller.work?.[verb];
        if (!fn) throw new Error(`work ${verb} unavailable`);
        return printOutput(await fn(Object.fromEntries(flags(rest))), rest, io.print);
      }
      case "help":
      case "--help":
      case "-h":
        io.print(HELP);
        return;
      default:
        io.printErr(`fulcrum work: unknown command '${verb}'`);
        io.printErr(HELP);
        io.exit(2);
    }
  } catch (error) {
    io.printErr(`fulcrum work ${verb}: ${errorMessage(error)}`);
    io.exit(1);
  }
}

async function createWork(caller: WorkCaller, input: Record<string, unknown>): Promise<unknown> {
  if (caller.work?.create) return caller.work.create(input);
  if (caller.tasks?.create) return caller.tasks.create(input);
  throw new Error("work create unavailable");
}

async function inspectWork(caller: WorkCaller, input: { id: string; mode?: string }): Promise<unknown> {
  if (!caller.work?.inspect) throw new Error("work inspect unavailable");
  return caller.work.inspect(input);
}

async function resolveCaller(opts: WorkRunOptions): Promise<WorkCaller> {
  if (opts.caller) return opts.caller;
  return await createLocalCaller({ container: opts.container, requireSession: true }) as unknown as WorkCaller;
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

function flags(argv: readonly string[]): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key?.startsWith("--") && value && !value.startsWith("-")) result.push([key.slice(2), value]);
  }
  return result;
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function errorMessage(error: unknown): string {
  if (error instanceof TRPCError) return `${error.code}: ${error.message}`;
  return (error as Error).message;
}
