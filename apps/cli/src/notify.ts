import {
  createNotificationApiCallerFromEnv,
  type NotificationApiEnvironment,
} from "@notification-center/interface/http/notification-api-client.ts";
import { formatApiError } from "./api-errors.ts";

type NotifyCaller = {
  notify: {
    list(input: { unread?: boolean; limit?: number; offset?: number }): Promise<unknown>;
    markRead(input: { id: string }): Promise<unknown>;
    markAllRead(): Promise<unknown>;
    mute(input: { subjectKind: string; subjectId: string; mutedUntil?: Date | null }): Promise<unknown>;
    unmute(input: { subjectKind: string; subjectId: string }): Promise<unknown>;
    rules: {
      list(): Promise<unknown[]>;
      get(input: { id: string }): Promise<unknown | null>;
      create(input: Record<string, unknown>): Promise<unknown>;
      update(input: Record<string, unknown>): Promise<unknown>;
      delete(input: { id: string }): Promise<unknown>;
    };
    channels: {
      list(): Promise<unknown[]>;
      config(input: Record<string, unknown>): Promise<unknown>;
      test(input: { kind: string }): Promise<unknown>;
    };
  };
};

export interface NotifyRunOptions {
  caller?: NotifyCaller;
  env?: NotificationApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum notify - notification management

Usage:
  fulcrum notify list [--unread] [--limit N] [--offset N] [--json]
  fulcrum notify read <id>
  fulcrum notify mark-read <id>|--all
  fulcrum notify mute <subject-kind> <subject-id> [--until <ISO>] [--json]
  fulcrum notify unmute <subject-kind> <subject-id>
  fulcrum notify rules list|get|create|update|delete [options]
  fulcrum notify channels list|config|test [options]
`;

export async function run(argv: readonly string[], opts: NotifyRunOptions = {}): Promise<void> {
  const io = ioFor(opts);
  const [verb = "help", ...rest] = argv;
  if (verb === "help" || verb === "--help" || verb === "-h") {
    io.print(HELP);
    return;
  }

  try {
    const caller = await resolveCaller(opts);
    switch (verb) {
      case "list":
        if (!validateFlags(rest, new Set(["--json", "--unread", "--limit", "--offset"]), io)) return;
        return printValue(await caller.notify.list({
          unread: rest.includes("--unread") || undefined,
          limit: numberFlag(rest, "--limit"),
          offset: numberFlag(rest, "--offset"),
        }), rest, io.print);
      case "read":
      case "mark-read":
        return runMarkRead(caller, rest, io);
      case "mute":
        return runMute(caller, rest, io);
      case "unmute":
        return runUnmute(caller, rest, io);
      case "rules":
        return runRules(caller, rest, io);
      case "channels":
        return runChannels(caller, rest, io);
      default:
        io.printErr(`fulcrum notify: unknown verb '${verb}'`);
        io.printErr(HELP);
        io.exit(2);
    }
  } catch (error) {
    io.printErr(`fulcrum notify ${verb}: ${errorMessage(error)}`);
    io.exit(1);
  }
}

async function runMarkRead(
  caller: NotifyCaller,
  argv: readonly string[],
  io: Required<Pick<NotifyRunOptions, "print" | "printErr" | "exit">>,
): Promise<void> {
  if (argv.includes("--all")) {
    printValue(await caller.notify.markAllRead(), argv, io.print);
    return;
  }
  const id = firstArg(argv);
  if (!id) {
    io.printErr("usage: fulcrum notify mark-read <id>|--all");
    io.exit(2);
    return;
  }
  printValue(await caller.notify.markRead({ id }), argv, io.print);
}

async function runMute(
  caller: NotifyCaller,
  argv: readonly string[],
  io: Required<Pick<NotifyRunOptions, "print" | "printErr" | "exit">>,
): Promise<void> {
  const args = positionals(argv);
  const [subjectKind, subjectId] = args;
  if (!subjectKind || !subjectId) {
    io.printErr("usage: fulcrum notify mute <subject-kind> <subject-id> [--until <ISO>]");
    io.exit(2);
    return;
  }
  const until = flagValue(argv, "--until");
  printValue(await caller.notify.mute({
    subjectKind,
    subjectId,
    mutedUntil: until ? new Date(until) : null,
  }), argv, io.print);
}

async function runUnmute(
  caller: NotifyCaller,
  argv: readonly string[],
  io: Required<Pick<NotifyRunOptions, "print" | "printErr" | "exit">>,
): Promise<void> {
  const args = positionals(argv);
  const [subjectKind, subjectId] = args;
  if (!subjectKind || !subjectId) {
    io.printErr("usage: fulcrum notify unmute <subject-kind> <subject-id>");
    io.exit(2);
    return;
  }
  printValue(await caller.notify.unmute({ subjectKind, subjectId }), argv, io.print);
}

async function runRules(
  caller: NotifyCaller,
  argv: readonly string[],
  io: Required<Pick<NotifyRunOptions, "print" | "printErr" | "exit">>,
): Promise<void> {
  const [sub, ...rest] = argv;
  if (!sub) {
    io.printErr("usage: fulcrum notify rules <list|get|create|update|delete>");
    io.exit(2);
    return;
  }
  switch (sub) {
    case "list":
      return printValue(await caller.notify.rules.list(), rest, io.print);
    case "get": {
      const id = firstArg(rest);
      if (!id) return usage(io, "usage: fulcrum notify rules get <id>");
      const rule = await caller.notify.rules.get({ id });
      if (!rule) {
        io.printErr(`rule not found: ${id}`);
        io.exit(1);
        return;
      }
      return printValue(rule, rest, io.print);
    }
    case "create":
      return printValue(await caller.notify.rules.create({
        name: requiredFlag(rest, "--name"),
        eventPattern: parseJsonFlag(rest, "--pattern"),
        channels: (requiredFlag(rest, "--channels")).split(",").map((channel) => channel.trim()).filter(Boolean),
        enabled: !rest.includes("--disable"),
      }), rest, io.print);
    case "update": {
      const id = firstArg(rest);
      if (!id) return usage(io, "usage: fulcrum notify rules update <id>");
      return printValue(await caller.notify.rules.update({ id }), rest, io.print);
    }
    case "delete": {
      const id = firstArg(rest);
      if (!id) return usage(io, "usage: fulcrum notify rules delete <id>");
      return printValue(await caller.notify.rules.delete({ id }), rest, io.print);
    }
    default:
      io.printErr(`fulcrum notify rules: unknown verb '${sub}'`);
      io.exit(2);
  }
}

async function runChannels(
  caller: NotifyCaller,
  argv: readonly string[],
  io: Required<Pick<NotifyRunOptions, "print" | "printErr" | "exit">>,
): Promise<void> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "list":
      return printValue(await caller.notify.channels.list(), rest, io.print);
    case "config": {
      const kind = firstArg(rest);
      if (!kind) return usage(io, "usage: fulcrum notify channels config <kind>");
      return printValue(await caller.notify.channels.config({ kind, url: flagValue(rest, "--url") }), rest, io.print);
    }
    case "test": {
      const kind = firstArg(rest);
      if (!kind) return usage(io, "usage: fulcrum notify channels test <kind>");
      return printValue(await caller.notify.channels.test({ kind }), rest, io.print);
    }
    default:
      io.printErr("usage: fulcrum notify channels <list|config|test>");
      io.exit(2);
  }
}

async function resolveCaller(opts: NotifyRunOptions): Promise<NotifyCaller> {
  if (opts.caller) return opts.caller;
  const publicApiCaller = createNotificationApiCallerFromEnv(opts.env, opts.fetch);
  if (publicApiCaller) return publicApiCaller as NotifyCaller;
  throw new Error(
    "Notification API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.",
  );
}

function printValue(value: unknown, argv: readonly string[], print: (line: string) => void): void {
  print(argv.includes("--json") ? JSON.stringify(value) : JSON.stringify(value, null, 2));
}

function usage(io: Required<Pick<NotifyRunOptions, "printErr" | "exit">>, message: string): void {
  io.printErr(message);
  io.exit(2);
}

function positionals(argv: readonly string[]): string[] {
  return argv.filter((arg, index) => !arg.startsWith("-") && !argv[index - 1]?.startsWith("--"));
}

function firstArg(argv: readonly string[]): string | undefined {
  return positionals(argv)[0];
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("-") ? value : undefined;
}

function validateFlags(argv: readonly string[], allowed: Set<string>, io: Required<Pick<NotifyRunOptions, "printErr" | "exit">>): boolean {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) continue;
    const name = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (!allowed.has(name)) {
      io.printErr(`unknown flag: ${name}`);
      io.exit(2);
      return false;
    }
    if (!arg.includes("=") && (name === "--limit" || name === "--offset")) i += 1;
  }
  return true;
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

function parseJsonFlag(argv: readonly string[], flag: string): Record<string, unknown> {
  return JSON.parse(requiredFlag(argv, flag)) as Record<string, unknown>;
}

function ioFor(opts: NotifyRunOptions): Required<Pick<NotifyRunOptions, "print" | "printErr" | "exit">> {
  return {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
}

function errorMessage(error: unknown): string {
  return formatApiError(error);
}
