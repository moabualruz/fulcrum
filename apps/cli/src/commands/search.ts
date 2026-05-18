import { formatApiError, formatCommandError } from "../api-errors.ts";
import {
  createSearchApiCallerFromEnv,
  type SearchApiEnvironment,
} from "@knowledge-workspace/interface/http/search-api-client.ts";
import {
  createTaskApiCallerFromEnv,
  type TaskApiEnvironment,
} from "@work-management/interface/http/task-api-client.ts";

const SEARCH_KINDS = ["task", "doc", "memory", "artifact", "repo", "agent_run"] as const;
type SearchKind = typeof SEARCH_KINDS[number];

interface SearchCaller {
  search?: {
    query: (input: SearchQueryInput) => Promise<unknown>;
    suggest: (input: { partial: string; kind?: SearchKind }) => Promise<unknown>;
    savedList: (input?: { project?: string }) => Promise<unknown>;
    savedCreate: (input: { name: string; queryJson: unknown }) => Promise<unknown>;
    savedDelete: (input: { id: string }) => Promise<unknown>;
    addToContext?: (input: { ids: string[]; project?: string; task?: string }) => Promise<unknown>;
  };
  tasks?: {
    create: (input: Record<string, unknown>) => Promise<unknown>;
  };
}

interface SearchQueryInput {
  q: string;
  kind?: SearchKind;
  project?: string;
  scope?: "all" | "global";
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
  env?: SearchApiEnvironment & TaskApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum search

Search commands.

Usage:
  fulcrum search <query> [--kind <kind>] [--project <id>] [--all-projects|--global] [--status <status>] [--assignee <id|me>] [--tag <tag>] [--date-range <ISO>/<ISO>] [--author <id>] [--limit <n>] [--offset <n>] [--semantic] [--json]
  fulcrum search query <query> [--kind <kind>] [--project <id>] [--all-projects|--global] [--status <status>] [--assignee <id|me>] [--tag <tag>] [--date-range <ISO>/<ISO>] [--author <id>] [--limit <n>] [--offset <n>] [--semantic] [--json]
  fulcrum search suggest <partial> [--kind <kind>] [--json]
  fulcrum search context add --ids <id,id> [--project <id>] [--task <id>] [--json]
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
    case "query":
      return runQuery(rest, resolved);
    case "suggest":
      return runSuggest(rest, resolved);
    case "context":
      return runContext(rest, resolved);
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

async function runContext(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const [sub = "help", ...rest] = argv;
  if (sub === "add") return runContextAdd(rest, opts);
  if (sub === "help" || sub === "--help" || sub === "-h") {
    opts.print(HELP);
    return;
  }
  fail("fulcrum search context", `unknown command '${sub}'`, opts);
}

async function runContextAdd(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const flags = parseFlags(argv);
  const ids = (flags.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    fail("fulcrum search context add", "missing required flag --ids <id,id>", opts);
    return;
  }

  await callAndPrint(
    "fulcrum search context add",
    argv.includes("--json"),
    opts,
    async (caller) => {
      if (!caller.search.addToContext) throw new Error("search.addToContext procedure is not available");
      return caller.search.addToContext(compact({ ids, project: flags.get("project"), task: flags.get("task") }));
    },
  );
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
    const caller = resolveCmdkCaller(resolved);
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

  if (argv.includes("--semantic")) {
    fail("fulcrum search", "FeatureDisabled: --semantic requires the embeddings feature flag to be enabled", opts);
    return;
  }

  // P11#16: NL→filter pre-processing when report-llm-narration flag ON
  const nlEnabled = isFeatureEnabled("report-llm-narration");
  let resolvedQuery = query;
  let resolvedKind = kind;
  let resolvedStatus = flags.get("status");
  let resolvedAssignee = flags.get("assignee");
  let resolvedTag = flags.get("tag");

  if (nlEnabled && !kind && !flags.get("status") && !flags.get("assignee")) {
    try {
      const { translateNlToFilter, HttpNlFilterSidecar } = await import("@knowledge-workspace/application/search/nl-filter.ts");
      const sidecar = new HttpNlFilterSidecar();
      const result = await translateNlToFilter(query, sidecar);
      if (result.translated && result.ast) {
        resolvedQuery = result.ast.text || query;
        if (result.ast.facets.kind?.length) resolvedKind = result.ast.facets.kind[0] as SearchKind | undefined;
        if (result.ast.facets.status?.length) resolvedStatus = result.ast.facets.status[0];
        if (result.ast.facets.assignee?.length) resolvedAssignee = result.ast.facets.assignee[0];
        if (result.ast.facets.label?.length) resolvedTag = result.ast.facets.label[0];
      }
    } catch {
      // NL→filter failed — continue with plain-text query
    }
  }

  const scope: SearchQueryInput["scope"] = argv.includes("--global")
    ? "global"
    : argv.includes("--all-projects")
      ? "all"
      : undefined;
  const input: SearchQueryInput = {
    q: resolvedQuery,
    ...(resolvedKind ? { kind: resolvedKind } : {}),
    ...(flags.get("project") ? { project: flags.get("project") } : {}),
    ...(scope ? { scope } : {}),
    ...(resolvedStatus ? { status: resolvedStatus } : {}),
    ...(resolvedAssignee ? { assignee: resolvedAssignee } : {}),
    ...(resolvedTag ? { tag: resolvedTag } : {}),
    ...(flags.get("date-range") ? { dateRange: flags.get("date-range") } : {}),
    ...(flags.get("author") ? { author: flags.get("author") } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(offset !== undefined ? { offset } : {}),
  };

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
  fn: (caller: SearchCaller & { search: NonNullable<SearchCaller["search"]> }) => Promise<unknown>,
): Promise<void> {
  try {
    const caller = resolveSearchCaller(opts);
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
    "--ids",
    "--task",
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
  if (err instanceof SyntaxError) return `invalid JSON: ${err.message}`;
  const message = formatApiError(err);
  return message.includes(": ") ? message : formatCommandError(err);
}

function isFeatureEnabled(flag: string): boolean {
  return (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean)
    .includes(flag);
}

function resolveSearchCaller(opts: SearchRunOptions): SearchCaller & { search: NonNullable<SearchCaller["search"]> } {
  if (opts.caller?.search) {
    return opts.caller as SearchCaller & { search: NonNullable<SearchCaller["search"]> };
  }
  const apiCaller = createSearchApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error(
      "Search API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL, FULCRUM_ORG_ID, FULCRUM_USER_ID, and FULCRUM_API_TOKEN or FULCRUM_PUBLIC_API_TOKEN.",
    );
  }
  return apiCaller as unknown as SearchCaller & { search: NonNullable<SearchCaller["search"]> };
}

function resolveCmdkCaller(opts: SearchRunOptions): SearchCaller {
  if (opts.caller?.tasks) return opts.caller;
  const apiCaller = createTaskApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error(
      "Task API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL plus FULCRUM_ORG_ID and FULCRUM_USER_ID.",
    );
  }
  return apiCaller as unknown as SearchCaller;
}
