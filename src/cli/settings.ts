import type { Container } from "@needle-di/core";

import { createLocalCaller } from "./local-caller.ts";

type SettingsCaller = {
  settings?: {
    list(): Promise<unknown[]>;
    get(input: { key: string }): Promise<unknown | null>;
    set(input: { key: string; value: string }): Promise<unknown>;
  };
};

export interface SettingsRunOptions {
  caller?: SettingsCaller;
  container?: Container | null;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum settings

Usage:
  fulcrum settings list [--json]
  fulcrum settings get <key> [--json]
  fulcrum settings set <key> <value> [--json]
`;

export async function run(argv: readonly string[], opts: SettingsRunOptions = {}): Promise<void> {
  const io = ioFor(opts);
  const [verb = "help", ...rest] = argv;
  if (verb === "help" || verb === "--help" || verb === "-h") {
    io.print(HELP);
    return;
  }

  try {
    const caller = await resolveCaller(opts);
    const settings = caller.settings;
    if (!settings) throw new Error("settings caller is not configured");

    switch (verb) {
      case "list":
        return printValue(await settings.list(), rest, io.print);
      case "get": {
        const key = firstArg(rest);
        if (!key) return usage(io, "usage: fulcrum settings get <key>");
        const value = await settings.get({ key });
        if (value === null) {
          io.printErr(`setting not found: ${key}`);
          io.exit(1);
          return;
        }
        return printValue(value, rest, io.print);
      }
      case "set": {
        const args = positionals(rest);
        const [key, value] = args;
        if (!key || value === undefined) return usage(io, "usage: fulcrum settings set <key> <value>");
        return printValue(await settings.set({ key, value }), rest, io.print);
      }
      default:
        io.printErr(`fulcrum settings: unknown verb '${verb}'`);
        io.exit(2);
    }
  } catch (error) {
    io.printErr(`fulcrum settings ${verb}: ${(error as Error).message}`);
    io.exit(1);
  }
}

async function resolveCaller(opts: SettingsRunOptions): Promise<SettingsCaller> {
  if (opts.caller) return opts.caller;
  return await createLocalCaller({ container: opts.container, requireSession: true }) as unknown as SettingsCaller;
}

function printValue(value: unknown, argv: readonly string[], print: (line: string) => void): void {
  print(argv.includes("--json") ? JSON.stringify(value) : formatValue(value));
}

function formatValue(value: unknown): string {
  if (typeof value === "object" && value !== null) return JSON.stringify(value, null, 2);
  return String(value);
}

function usage(io: Required<Pick<SettingsRunOptions, "printErr" | "exit">>, message: string): void {
  io.printErr(message);
  io.exit(2);
}

function positionals(argv: readonly string[]): string[] {
  return argv.filter((arg, index) => !arg.startsWith("-") && !argv[index - 1]?.startsWith("--"));
}

function firstArg(argv: readonly string[]): string | undefined {
  return positionals(argv)[0];
}

function ioFor(opts: SettingsRunOptions): Required<Pick<SettingsRunOptions, "print" | "printErr" | "exit">> {
  return {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
}
