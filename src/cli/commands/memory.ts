import { TRPCError } from "@trpc/server";
import { Container } from "@needle-di/core";
import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";
import type { Session as BetterAuthSession } from "better-auth";

import {
  ENTITY_MANAGER_TOKEN,
  registerDbBindings,
} from "../../db/db.module.ts";

type MemoryRow = Record<string, unknown>;

type MemoryCaller = {
  memory: {
    list: (input?: Record<string, unknown>) => Promise<MemoryRow[]>;
    get: (input: { id: string }) => Promise<MemoryRow>;
    create: (input: Record<string, unknown>) => Promise<MemoryRow>;
    delete: (input: { id: string }) => Promise<unknown>;
    search: (input: Record<string, unknown>) => Promise<MemoryRow[]>;
    promote: (input: { id: string }) => Promise<MemoryRow>;
  };
};

export interface MemoryRunOptions {
  caller?: MemoryCaller;
  container?: Container | null;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum memory

Memory commands.

Usage:
  fulcrum memory list [--project <id>] [--global] [--kind <kind>] [--tag <tag>] [--importance <level>] [--archived] [--json]
  fulcrum memory get <id> [--json]
  fulcrum memory add <text> [--project <id>] [--global] [--kind <kind>] [--tag <tag>] [--importance <level>] [--json]
  fulcrum memory delete <id> [--json]
  fulcrum memory search <query> [--project <id>] [--global] [--kind <kind>] [--tag <tag>] [--importance <level>] [--archived] [--top <n>] [--json]
  fulcrum memory promote <id> [--json]

Options:
  --json              Output as machine-readable JSON.
  --project <id>      Filter or create project-scoped memory.
  --global            Filter or create global memory.
  --kind <kind>       Memory kind.
  --tag <tag>         Repeatable tag filter or metadata.
  --importance <lvl>  Memory importance.
  --archived          Include archived rows.
  --top <n>           Search result limit.
  -h, --help          Show this help.
`;

export async function run(
  argv: readonly string[],
  opts: MemoryRunOptions = {},
): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;
  const [sub = "help", ...rest] = argv;
  const runOpts = { ...opts, print, printErr, exit };

  switch (sub) {
    case "list":
      return withErrors("list", runOpts, async () => {
        const caller = await resolveCaller(runOpts);
        const result = await caller.memory.list(parseListInput(rest));
        printOutput(result, rest, print, formatRows);
      });
    case "get":
      return withErrors("get", runOpts, async () => {
        const id = requireArg(rest, 0, "get", "<id>");
        const caller = await resolveCaller(runOpts);
        const result = await caller.memory.get({ id });
        printOutput(result, rest, print, formatRow);
      });
    case "add":
      return withErrors("add", runOpts, async () => {
        const body = requireArg(rest, 0, "add", "<text>");
        const caller = await resolveCaller(runOpts);
        const result = await caller.memory.create({ body, ...parseCreateInput(rest.slice(1)) });
        printOutput(result, rest, print, formatRow);
      });
    case "delete":
      return withErrors("delete", runOpts, async () => {
        const id = requireArg(rest, 0, "delete", "<id>");
        const caller = await resolveCaller(runOpts);
        const result = await caller.memory.delete({ id });
        printOutput(result, rest, print, () => `Deleted memory ${id}.`);
      });
    case "search":
      return withErrors("search", runOpts, async () => {
        const query = requireArg(rest, 0, "search", "<query>");
        const caller = await resolveCaller(runOpts);
        const result = await caller.memory.search({ query, ...parseSearchInput(rest.slice(1)) });
        printOutput(result, rest, print, formatRows);
      });
    case "promote":
      return withErrors("promote", runOpts, async () => {
        const id = requireArg(rest, 0, "promote", "<id>");
        const caller = await resolveCaller(runOpts);
        const result = await caller.memory.promote({ id });
        printOutput(result, rest, print, () => `Promoted memory ${id}.`);
      });
    case "help":
    case "--help":
    case "-h":
      print(HELP);
      return;
    default:
      printErr(`fulcrum memory: unknown command '${sub}'`);
      printErr(HELP);
      exit(2);
  }
}

function parseListInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    projectId: flagValue(argv, "--project"),
    global: argv.includes("--global") ? true : undefined,
    kind: flagValue(argv, "--kind"),
    tags: flagValues(argv, "--tag"),
    importance: flagValue(argv, "--importance"),
    archived: argv.includes("--archived") ? true : undefined,
  });
}

function parseCreateInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    projectId: flagValue(argv, "--project"),
    global: argv.includes("--global") ? true : undefined,
    kind: flagValue(argv, "--kind"),
    tags: flagValues(argv, "--tag"),
    importance: flagValue(argv, "--importance"),
  });
}

function parseSearchInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    ...parseListInput(argv),
    topK: numberFlag(argv, "--top"),
  });
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  return argv[index + 1];
}

function flagValues(argv: readonly string[], flag: string): string[] | undefined {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === flag && argv[i + 1]) values.push(argv[i + 1]!);
  }
  return values.length > 0 ? values : undefined;
}

function numberFlag(argv: readonly string[], flag: string): number | undefined {
  const value = flagValue(argv, flag);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function requireArg(argv: readonly string[], index: number, command: string, name: string): string {
  const value = argv[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`fulcrum memory ${command}: missing required argument ${name}`);
  }
  return value;
}

function printOutput(
  value: unknown,
  argv: readonly string[],
  print: (line: string) => void,
  human: (value: unknown) => string,
): void {
  if (argv.includes("--json")) {
    print(JSON.stringify(value));
  } else {
    print(human(value));
  }
}

function formatRows(value: unknown): string {
  const rows = Array.isArray(value) ? value : [];
  if (rows.length === 0) return "No memories found.";
  return rows.map(formatRow).join("\n");
}

function formatRow(value: unknown): string {
  const row = value as MemoryRow;
  const id = String(row.id ?? "");
  const kind = String(row.kind ?? "memory");
  const body = String(row.body ?? row.content ?? "");
  return `${id}  ${kind}  ${body}`;
}

async function withErrors(
  command: string,
  opts: Required<Pick<MemoryRunOptions, "print" | "printErr" | "exit">> & MemoryRunOptions,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const msg = err instanceof TRPCError
      ? `${err.code}: ${err.message}`
      : (err as Error).message;
    opts.printErr(`fulcrum memory ${command}: ${msg}`);
    opts.exit(1);
  }
}

async function resolveCaller(opts: MemoryRunOptions): Promise<MemoryCaller> {
  if (opts.caller) return opts.caller;

  const { t } = await import("../../trpc/trpc.ts");
  const { appRouter } = await import("../../trpc/router.ts");
  const { createContext } = await import("../../trpc/context.ts");

  const cliContext = buildCliContext(opts.container ?? null);
  const { container, em } = cliContext;
  const session = await resolveActiveCliSession(em);
  if (!session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No active CLI session found. Run `fulcrum init` or `fulcrum auth login` before memory commands.",
    });
  }

  const orgId = session.activeOrganizationId ?? session.orgId;
  const userId = session.userId;
  if (!orgId || !userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Active CLI session is missing orgId or userId. Re-authenticate.",
    });
  }

  const ctx = createContext({
    session: session as unknown as BetterAuthSession,
    orgId,
    userId,
    em,
    container,
  });
  const factory = t.createCallerFactory(appRouter);
  return factory(ctx) as unknown as MemoryCaller;
}

function buildCliContext(container: Container | null): { container: Container | null; em: EntityManager | null } {
  if (!container) return { container: null, em: null };

  try {
    const orm = container.get(MikroORM);
    const em = container.get(ENTITY_MANAGER_TOKEN).fork();
    const requestContainer = new Container();
    requestContainer.bind({ provide: MikroORM, useValue: orm });
    registerDbBindings(requestContainer, orm, em);
    return { container: requestContainer, em };
  } catch {
    return { container, em: null };
  }
}

async function resolveActiveCliSession(em: EntityManager | null): Promise<{
  id: string;
  token: string;
  userId: string;
  orgId: string;
  activeOrganizationId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
} | null> {
  if (!em) return null;

  const { Session } = await import("../../db/entities/auth/Session.ts");
  const now = new Date();

  try {
    const session = await em.findOne(
      Session,
      { expiresAt: { $gt: now } },
      { orderBy: { createdAt: "DESC" } },
    );
    if (!session) return null;

    return {
      id: session.id,
      token: session.id,
      userId: session.userId,
      orgId: session.orgId,
      activeOrganizationId: session.activeOrganizationId ?? session.orgId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.createdAt,
      ipAddress: session.ipAddress ?? null,
      userAgent: session.userAgent ?? "fulcrum-cli",
    };
  } catch {
    return null;
  }
}
