import { TRPCError } from "@trpc/server";
import { Container } from "@needle-di/core";
import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";
import type { Session as BetterAuthSession } from "better-auth";

import {
  ENTITY_MANAGER_TOKEN,
  registerDbBindings,
} from "../../db/db.module.ts";

const SEARCH_KINDS = ["task", "doc", "memory", "artifact", "repo", "agent_run"] as const;
type SearchKind = typeof SEARCH_KINDS[number];

interface SearchCaller {
  search: {
    query: (input: SearchQueryInput) => Promise<unknown>;
    suggest: (input: { partial: string; kind?: SearchKind }) => Promise<unknown>;
    savedList: (input?: { project?: string }) => Promise<unknown>;
    savedCreate: (input: { name: string; queryJson: unknown }) => Promise<unknown>;
    savedDelete: (input: { id: string }) => Promise<unknown>;
  };
  tasks?: {
    create: (input: Record<string, unknown>) => Promise<unknown>;
  };
}

interface SearchQueryInput {
  q: string;
  kind?: SearchKind;
  project?: string;
  status?: string;
  assignee?: string;
  tag?: string;
  dateRange?: string;
  author?: string;
  limit?: number;
  offset?: number;
}

export interface SearchRunOptions {
  caller?: SearchCaller;
  container?: Container | null;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum search

Search commands.

Usage:
  fulcrum search <query> [--kind <kind>] [--project <id>] [--status <status>] [--assignee <id|me>] [--tag <tag>] [--date-range <ISO>/<ISO>] [--author <id>] [--limit <n>] [--offset <n>] [--json]
  fulcrum search suggest <partial> [--kind <kind>] [--json]
  fulcrum search saved list [--project <id>] [--json]
  fulcrum search saved create --name <name> --query-json <json> [--json]
  fulcrum search saved delete <id> [--json]

Options:
  --json      Output as machine-readable JSON.
  -h, --help  Show this help.
`;

const CMDK_HELP = `fulcrum cmdk

Headless command palette dispatcher.

Usage:
  fulcrum cmdk <command-name> [--args <json>] [--json]

Commands:
  create-task  Create a task via tasks.create.
`;

export async function run(
  argv: readonly string[],
  opts: SearchRunOptions = {},
): Promise<void> {
  const resolved = resolveOptions(opts);
  const [first = "help", ...rest] = argv;

  switch (first) {
    case "suggest":
      return runSuggest(rest, resolved);
    case "saved":
      return runSaved(rest, resolved);
    case "help":
    case "--help":
    case "-h":
      resolved.print(HELP);
      return;
    default:
      return runQuery(argv, resolved);
  }
}

export async function runCmdk(
  argv: readonly string[],
  opts: SearchRunOptions = {},
): Promise<void> {
  const resolved = resolveOptions(opts);
  const [command = "help", ...rest] = argv;

  if (command === "help" || command === "--help" || command === "-h") {
    resolved.print(CMDK_HELP);
    return;
  }

  const jsonMode = rest.includes("--json");
  if (command !== "create-task") {
    fail("fulcrum cmdk", `unknown cmdk command '${command}'`, resolved);
    return;
  }

  try {
    const caller = await resolveCaller(resolved);
    if (!caller.tasks?.create) throw new Error("tasks.create procedure is not available");
    const args = parseJsonFlag(rest, "args") ?? {};
    const result = await caller.tasks.create(asRecord(args));
    printResult(result, jsonMode, resolved.print);
  } catch (err) {
    fail("fulcrum cmdk create-task", errorMessage(err), resolved);
  }
}

type ResolvedOptions = Required<Pick<SearchRunOptions, "print" | "printErr" | "exit">> & SearchRunOptions;

function resolveOptions(opts: SearchRunOptions): ResolvedOptions {
  return {
    ...opts,
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
}

async function runQuery(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const flags = parseFlags(argv);
  const query = firstPositional(argv);
  if (!query) {
    opts.printErr("fulcrum search: missing required argument <query>");
    opts.printErr(HELP);
    opts.exit(1);
    return;
  }

  const kind = parseKind(flags.get("kind"), opts);
  if (kind === null) return;

  const limit = parseIntegerFlag(flags.get("limit"), "limit", opts);
  const offset = parseIntegerFlag(flags.get("offset"), "offset", opts);
  if (limit === null || offset === null) return;

  const input: SearchQueryInput = compact({
    q: query,
    kind,
    project: flags.get("project"),
    status: flags.get("status"),
    assignee: flags.get("assignee"),
    tag: flags.get("tag"),
    dateRange: flags.get("date-range"),
    author: flags.get("author"),
    limit,
    offset,
  });

  await callAndPrint("fulcrum search", argv.includes("--json"), opts, async (caller) => caller.search.query(input));
}

async function runSuggest(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const flags = parseFlags(argv);
  const partial = firstPositional(argv);
  if (!partial) {
    fail("fulcrum search suggest", "missing required argument <partial>", opts);
    return;
  }

  const kind = parseKind(flags.get("kind"), opts);
  if (kind === null) return;

  await callAndPrint(
    "fulcrum search suggest",
    argv.includes("--json"),
    opts,
    async (caller) => caller.search.suggest(compact({ partial, kind })),
  );
}

async function runSaved(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const [sub = "help", ...rest] = argv;
  switch (sub) {
    case "list":
      return callAndPrint(
        "fulcrum search saved list",
        rest.includes("--json"),
        opts,
        async (caller) => caller.search.savedList(compact({ project: parseFlags(rest).get("project") })),
      );
    case "create":
      return runSavedCreate(rest, opts);
    case "delete":
      return runSavedDelete(rest, opts);
    case "help":
    case "--help":
    case "-h":
      opts.print(HELP);
      return;
    default:
      fail("fulcrum search saved", `unknown command '${sub}'`, opts);
  }
}

async function runSavedCreate(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const flags = parseFlags(argv);
  const name = flags.get("name");
  if (!name) {
    fail("fulcrum search saved create", "missing required flag --name <name>", opts);
    return;
  }

  const queryJson = parseJsonFlag(argv, "query-json");
  if (queryJson === undefined) {
    fail("fulcrum search saved create", "missing required flag --query-json <json>", opts);
    return;
  }

  await callAndPrint(
    "fulcrum search saved create",
    argv.includes("--json"),
    opts,
    async (caller) => caller.search.savedCreate({ name, queryJson }),
  );
}

async function runSavedDelete(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const id = firstPositional(argv) ?? parseFlags(argv).get("id");
  if (!id) {
    fail("fulcrum search saved delete", "missing required argument <id>", opts);
    return;
  }

  await callAndPrint(
    "fulcrum search saved delete",
    argv.includes("--json"),
    opts,
    async (caller) => caller.search.savedDelete({ id }),
  );
}

async function callAndPrint(
  label: string,
  jsonMode: boolean,
  opts: ResolvedOptions,
  fn: (caller: SearchCaller) => Promise<unknown>,
): Promise<void> {
  try {
    const caller = await resolveCaller(opts);
    const result = await fn(caller);
    printResult(result, jsonMode, opts.print);
  } catch (err) {
    fail(label, errorMessage(err), opts);
  }
}

function printResult(result: unknown, jsonMode: boolean, print: (line: string) => void): void {
  if (jsonMode) {
    print(JSON.stringify(result));
    return;
  }
  print(typeof result === "string" ? result : JSON.stringify(result, null, 2));
}

function parseFlags(argv: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item?.startsWith("--")) continue;
    const [rawName, inlineValue] = item.slice(2).split("=", 2);
    if (!rawName || rawName === "json") continue;
    const next = inlineValue ?? argv[i + 1];
    if (next && !next.startsWith("--")) {
      flags.set(rawName, next);
      if (inlineValue === undefined) i += 1;
    }
  }
  return flags;
}

function firstPositional(argv: readonly string[]): string | undefined {
  const flagsWithValues = new Set([
    "--kind",
    "--project",
    "--status",
    "--assignee",
    "--tag",
    "--date-range",
    "--author",
    "--limit",
    "--offset",
    "--name",
    "--query-json",
    "--args",
    "--id",
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item) continue;
    if (!item.startsWith("-")) return item;
    if (item.includes("=")) continue;
    if (flagsWithValues.has(item)) i += 1;
  }
  return undefined;
}

function parseKind(value: string | undefined, opts: ResolvedOptions): SearchKind | undefined | null {
  if (!value) return undefined;
  if ((SEARCH_KINDS as readonly string[]).includes(value)) return value as SearchKind;
  fail("fulcrum search", `unknown --kind '${value}'`, opts);
  return null;
}

function parseIntegerFlag(value: string | undefined, name: string, opts: ResolvedOptions): number | undefined | null {
  if (!value) return undefined;
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  fail("fulcrum search", `--${name} must be a non-negative integer`, opts);
  return null;
}

function parseJsonFlag(argv: readonly string[], name: string): unknown | undefined {
  const raw = parseFlags(argv).get(name);
  if (raw === undefined) return undefined;
  return JSON.parse(raw);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error("--args must be a JSON object");
}

function compact<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T;
}

function fail(label: string, message: string, opts: ResolvedOptions): void {
  opts.printErr(`${label}: ${message}`);
  opts.exit(1);
}

function errorMessage(err: unknown): string {
  if (err instanceof TRPCError) return `${err.code}: ${err.message}`;
  if (err instanceof SyntaxError) return `invalid JSON: ${err.message}`;
  return `Error: ${(err as Error).message}`;
}

async function resolveCaller(opts: SearchRunOptions): Promise<SearchCaller> {
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
      message: "No active CLI session found. Run `fulcrum init` or `fulcrum auth login` before search commands.",
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
  return factory(ctx) as unknown as SearchCaller;
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
