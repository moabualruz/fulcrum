import type { Container } from "@needle-di/core";

import { initializeLocalProductReadiness } from "@/application/cli-tui/caller-context.ts";
import { createLocalCaller } from "./local-caller.ts";
import { buildDbContainer } from "./index.ts";

type ProductCaller = {
  projects?: { list(input?: Record<string, unknown>): Promise<unknown[]> };
  tasks?: {
    create(input: Record<string, unknown>): Promise<unknown>;
    list(input?: Record<string, unknown>): Promise<unknown[] | { data?: unknown[] }>;
    update(input: Record<string, unknown>): Promise<unknown>;
  };
  sprints?: {
    list(input?: Record<string, unknown>): Promise<unknown[]>;
    start?(input: { id: string }): Promise<unknown>;
    close?(input: Record<string, unknown>): Promise<unknown>;
  };
  search?: { query(input: Record<string, unknown>): Promise<unknown[]> };
  context?: { assemble?(input: Record<string, unknown>): Promise<unknown> };
};

export interface ProductRunOptions {
  caller?: ProductCaller;
  container?: Container | null;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum product - local product commands

Usage:
  fulcrum product init [--json]
  fulcrum product projects list [--json] [--limit <N>]
  fulcrum product tasks create --title <T> --project <P> [--json]
  fulcrum product tasks list [--status <S>] [--assignee <A>] [--project <P>] [--json]
  fulcrum product tasks update <id> --status <S> [--json]
  fulcrum product tasks bulk <id,id,...> --status <S> [--json]
  fulcrum product tasks move <id> --sprint <S> [--json]
  fulcrum product sprints list --project <P> [--json]
  fulcrum product sprints activate <id> [--json]
  fulcrum product sprints complete <id> [--json]
  fulcrum product search <query> [--org-slug <slug>] [--kind <kind>] [--limit <N>] [--json]
  fulcrum product context assemble --task <id> [--org-slug <slug>] [--json]
`;

const BOOLEAN_FLAGS = new Set<string>(["--json"]);
const VALUE_FLAGS = new Set<string>([
  "--assignee",
  "--kind",
  "--limit",
  "--org-slug",
  "--project",
  "--sprint",
  "--status",
  "--task",
  "--title",
]);
const KNOWN_FLAGS = new Set<string>([...BOOLEAN_FLAGS, ...VALUE_FLAGS]);

export interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | true>;
  passthrough: string[];
}

export function parseProductArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  const passthrough: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token === "--") {
      passthrough.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      const name = eq === -1 ? token : token.slice(0, eq);
      if (!KNOWN_FLAGS.has(name)) throw new Error(`unknown flag: ${name}`);
      if (eq !== -1) {
        if (BOOLEAN_FLAGS.has(name)) throw new Error(`flag does not take a value: ${name}`);
        flags[name] = token.slice(eq + 1);
        continue;
      }
      if (BOOLEAN_FLAGS.has(token)) {
        flags[token] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) throw new Error(`missing value for flag: ${token}`);
      flags[token] = next;
      i += 1;
      continue;
    }
    positionals.push(token);
  }
  return { positionals, flags, passthrough };
}

export async function run(argv: readonly string[], opts: ProductRunOptions = {}): Promise<void> {
  const io = ioFor(opts);
  const [verb = "help", ...rest] = argv;
  if (verb === "help" || verb === "--help" || verb === "-h") {
    io.print(HELP);
    return;
  }

  try {
    const resolved = verb === "init" ? null : await resolveCaller(opts);
    try {
      const caller = resolved?.caller ?? null;
      switch (verb) {
        case "init":
          return await runInit(rest, io);
        case "projects":
          return await runProjects(caller!, rest, io);
        case "tasks":
          return await runTasks(caller!, rest, io);
        case "sprints":
          return await runSprints(caller!, rest, io);
        case "custom-fields":
        case "saved-views":
          return printValue([], rest, io.print);
        case "search":
          return await runSearch(caller!, rest, io);
        case "context":
          return await runContext(caller!, rest, io);
        default:
          io.printErr(`fulcrum product: unknown verb '${verb}'`);
          io.printErr(HELP);
          io.exit(2);
      }
    } finally {
      await resolved?.cleanup();
    }
  } catch (error) {
    io.printErr(`fulcrum product ${verb}: ${(error as Error).message}`);
    io.exit(isUsageError(error) ? 2 : 1);
  }
}

async function runInit(argv: readonly string[], io: Io): Promise<void> {
  validateFlags(argv, new Set(["--json"]));
  return printValue(await initializeLocalProductReadiness(), argv, io.print);
}

async function runProjects(caller: ProductCaller, argv: readonly string[], io: Io): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub !== "list") return usage(io, `fulcrum product projects: unknown verb '${sub ?? ""}'`);
  printValue(await caller.projects?.list({ limit: numberFlag(rest, "--limit") }) ?? [], rest, io.print);
}

async function runTasks(caller: ProductCaller, argv: readonly string[], io: Io): Promise<void> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "create":
      return printValue(await requireTasks(caller).create({
        title: requiredFlag(rest, "--title"),
        projectId: flagValue(rest, "--project"),
      }), rest, io.print);
    case "list": {
      const result = await requireTasks(caller).list({
        projectId: flagValue(rest, "--project"),
        status: flagValue(rest, "--status"),
        assigneeId: flagValue(rest, "--assignee"),
      });
      return printValue(Array.isArray(result) ? result : result.data ?? [], rest, io.print);
    }
    case "update": {
      const id = firstArg(rest);
      if (!id) return usage(io, "usage: fulcrum product tasks update <id> --status <S>");
      return printValue(await requireTasks(caller).update({ id, status: flagValue(rest, "--status") }), rest, io.print);
    }
    case "bulk": {
      const ids = firstArg(rest);
      if (!ids) return usage(io, "usage: fulcrum product tasks bulk <id,id,...> --status <S>");
      const status = requiredFlag(rest, "--status");
      const updated = [];
      for (const id of ids.split(",")) updated.push(await requireTasks(caller).update({ id, status }));
      return printValue(updated, rest, io.print);
    }
    case "move": {
      const id = firstArg(rest);
      const sprintId = flagValue(rest, "--sprint");
      if (!id || !sprintId) return usage(io, "usage: fulcrum product tasks move <id> --sprint <S>");
      return printValue(await requireTasks(caller).update({ id, sprintId }), rest, io.print);
    }
    default:
      return usage(io, `fulcrum product tasks: unknown verb '${sub ?? ""}'`);
  }
}

async function runSprints(caller: ProductCaller, argv: readonly string[], io: Io): Promise<void> {
  const [sub, ...rest] = argv;
  switch (sub) {
    case "list":
      return printValue(await caller.sprints?.list({ projectId: flagValue(rest, "--project") }) ?? [], rest, io.print);
    case "activate": {
      const id = firstArg(rest);
      if (!id) return usage(io, "usage: fulcrum product sprints activate <id>");
      return printValue(await caller.sprints?.start?.({ id }) ?? { id, status: "active" }, rest, io.print);
    }
    case "complete": {
      const id = firstArg(rest);
      if (!id) return usage(io, "usage: fulcrum product sprints complete <id>");
      return printValue(await caller.sprints?.close?.({ id, unfinishedDisposition: "backlog" }) ?? { id, status: "completed" }, rest, io.print);
    }
    default:
      return usage(io, `fulcrum product sprints: unknown verb '${sub ?? ""}'`);
  }
}

async function runSearch(caller: ProductCaller, argv: readonly string[], io: Io): Promise<void> {
  const query = firstArg(argv);
  if (!query) return usage(io, "usage: fulcrum product search <query>");
  printValue(await caller.search?.query({
    query,
    kind: flagValue(argv, "--kind"),
    limit: numberFlag(argv, "--limit") ?? 25,
  }) ?? [], argv, io.print);
}

async function runContext(caller: ProductCaller, argv: readonly string[], io: Io): Promise<void> {
  const [sub, ...rest] = argv;
  if (sub !== "assemble") return usage(io, `fulcrum product context: unknown verb '${sub ?? ""}'`);
  const taskId = flagValue(rest, "--task");
  if (!taskId) return usage(io, "usage: fulcrum product context assemble --task <id>");
  printValue(await caller.context?.assemble?.({ taskId }) ?? { taskId, body: "" }, rest, io.print);
}

async function resolveCaller(opts: ProductRunOptions): Promise<{ caller: ProductCaller; cleanup: () => Promise<void> }> {
  if (opts.caller) return { caller: opts.caller, cleanup: async () => {} };
  if (opts.container) {
    return {
      caller: await createLocalCaller({ container: opts.container, requireSession: true }) as unknown as ProductCaller,
      cleanup: async () => {},
    };
  }
  const runtime = await buildDbContainer();
  return {
    caller: await createLocalCaller({ container: runtime.container, requireSession: true }) as unknown as ProductCaller,
    cleanup: runtime.cleanup,
  };
}

function requireTasks(caller: ProductCaller): NonNullable<ProductCaller["tasks"]> {
  if (!caller.tasks) throw new Error("tasks caller is not configured");
  return caller.tasks;
}

function printValue(value: unknown, argv: readonly string[], print: (line: string) => void): void {
  print(argv.includes("--json") ? JSON.stringify(value) : formatValue(value));
}

function formatValue(value: unknown): string {
  if (Array.isArray(value) && value.length === 0) return "[]";
  if (typeof value === "object" && value !== null) return JSON.stringify(value, null, 2);
  return String(value);
}

function usage(io: Pick<Io, "printErr" | "exit">, message: string): void {
  io.printErr(message);
  io.exit(2);
}

function firstArg(argv: readonly string[]): string | undefined {
  return parseProductArgs(argv).positionals[0];
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const value = parseProductArgs(argv).flags[flag];
  return typeof value === "string" ? value : undefined;
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

function validateFlags(argv: readonly string[], allowed: ReadonlySet<string>): void {
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const name = token.includes("=") ? token.slice(0, token.indexOf("=")) : token;
    if (!allowed.has(name)) throw new Error(`unknown flag: ${name}`);
  }
}

type Io = Required<Pick<ProductRunOptions, "print" | "printErr" | "exit">>;

function ioFor(opts: ProductRunOptions): Io {
  return {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
}

function isUsageError(error: unknown): boolean {
  const message = (error as Error).message ?? "";
  return message.startsWith("unknown flag:") ||
    message.startsWith("missing value for flag:") ||
    message.startsWith("flag does not take a value:") ||
    message.startsWith("missing required flag");
}
