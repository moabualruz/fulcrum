import type { Container } from "@needle-di/core";
import { TRPCError } from "@trpc/server";

import { createLocalCaller } from "./local-caller.ts";

type SprintsCaller = {
  sprints: {
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

const HELP = `fulcrum sprints - sprint planning commands

Usage:
  fulcrum sprints add-task --sprint-id <id> --task-id <id> [--json]
  fulcrum sprints remove-task --sprint-id <id> --task-id <id> [--json]
`;

export async function run(argv: readonly string[], opts: SprintsRunOptions = {}): Promise<void> {
  const io = ioFor(opts);
  const [verb = "help", ...rest] = argv;
  if (verb === "help" || verb === "--help" || verb === "-h") {
    io.print(HELP);
    return;
  }

  try {
    switch (verb) {
      case "add-task":
        return runMove(rest, "add-task", opts, io);
      case "remove-task":
        return runMove(rest, "remove-task", opts, io);
      default:
        io.printErr(`fulcrum sprints: unknown verb '${verb}'`);
        io.printErr(HELP);
        io.exit(2);
        return;
    }
  } catch (error) {
    io.printErr(`fulcrum sprints ${verb}: ${errorMessage(error)}`);
    io.exit(1);
  }
}

async function runMove(
  argv: readonly string[],
  command: "add-task" | "remove-task",
  opts: SprintsRunOptions,
  io: Required<Pick<SprintsRunOptions, "print" | "printErr" | "exit">>,
): Promise<void> {
  const sprintId = flagValue(argv, "--sprint-id");
  const taskId = flagValue(argv, "--task-id");
  const json = argv.includes("--json");
  if (!sprintId || !taskId) {
    io.printErr(`usage: fulcrum sprints ${command} --sprint-id <id> --task-id <id>`);
    io.exit(2);
    return;
  }

  const caller = await resolveCaller(opts);
  const result = command === "add-task"
    ? await caller.sprints.addTask({ sprintId, taskId })
    : await caller.sprints.removeTask({ sprintId, taskId });
  if (json) {
    io.print(JSON.stringify(result));
    return;
  }
  io.print(`task ${taskId} ${command === "add-task" ? "added to" : "removed from"} sprint ${sprintId}`);
}

async function resolveCaller(opts: SprintsRunOptions): Promise<SprintsCaller> {
  if (opts.caller) return opts.caller;
  return await createLocalCaller({ container: opts.container, requireSession: true }) as unknown as SprintsCaller;
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("-") ? value : undefined;
}

function ioFor(opts: SprintsRunOptions): Required<Pick<SprintsRunOptions, "print" | "printErr" | "exit">> {
  return {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof TRPCError) return `${error.code}: ${error.message}`;
  return (error as Error).message;
}
