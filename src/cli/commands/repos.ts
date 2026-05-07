import type { Container } from "@needle-di/core";

import { createLocalCaller } from "../local-caller.ts";

interface RepoItem {
  id: string;
  orgId?: string;
  name?: string;
  slug: string;
  kind?: "local" | "remote";
  localPath?: string | null;
  remoteUrl?: string | null;
  path?: string | null;
  defaultBranch?: string | null;
  currentBranch?: string | null;
  branch?: string | null;
  dirty?: boolean;
  lastSyncAt?: Date | string | null;
  syncStatus?: string;
  lastTouchedAt?: Date | string | null;
  archived?: boolean;
  openTaskCount?: number;
  health?: string;
  recentCommit?: string | null;
}

interface RepoCliRow {
  id: string;
  slug: string;
  branch: string | null;
  dirty: boolean;
  lastSyncAt: string | null;
  openTaskCount: number;
}

interface RepoSyncQueued {
  repoId: string;
  status: "queued";
  taskName: string;
  jobKey: string;
}

interface ReposCaller {
  repos: {
    register: (input:
      | { kind: "local"; path: string; name?: string; slug?: string }
      | { kind: "remote"; url: string; name?: string; slug?: string }
    ) => Promise<RepoItem>;
    list: (input?: { includeArchived?: boolean }) => Promise<RepoItem[]>;
    get: (input: { id: string }) => Promise<RepoItem | null>;
    sync?: (input: { id: string }) => Promise<RepoItem | null>;
    syncRepo?: (input: { repoId: string }) => Promise<RepoSyncQueued | null>;
    unregister: (input: { id: string }) => Promise<RepoItem | null>;
    branches?: (input: { id: string }) => Promise<unknown[]>;
    commits?: (input: { id: string }) => Promise<unknown[]>;
    files?: (input: { id: string }) => Promise<unknown[]>;
  };
}

export interface ReposRunOptions {
  caller?: ReposCaller;
  container?: Container | null;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum repos

Repository supervision commands.

Usage:
  fulcrum repos register (--path <dir> | --url <remote>) [--name <name>] [--slug <slug>] [--json]
  fulcrum repos list [--include-archived] [--json]
  fulcrum repos sync <id> [--json]
  fulcrum repos unregister <id> [--json]
  fulcrum repos status <id> [--json]
  fulcrum repos branches <id> [--json]
  fulcrum repos commits <id> [--json]
  fulcrum repos files <id> [--json]

Options:
  --json              Output as machine-readable JSON.
  --include-archived  Include archived repos in list output.
  -h, --help          Show this help.
`;

export async function run(
  argv: readonly string[],
  opts: ReposRunOptions = {},
): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;
  const [sub = "help", ...rest] = argv;
  const resolved = { ...opts, print, printErr, exit };

  switch (sub) {
    case "register":
      return runRegister(rest, resolved);
    case "list":
      return runList(rest, resolved);
    case "sync":
      return runSync(rest, resolved);
    case "unregister":
      return runRepoMutation("unregister", rest, resolved);
    case "status":
      return runStatus(rest, resolved);
    case "branches":
    case "commits":
    case "files":
      return runRepoReadOnly(sub, rest, resolved);
    case "help":
    case "--help":
    case "-h":
      print(HELP);
      return;
    default:
      printErr(`fulcrum repos: unknown command '${sub}'`);
      printErr(HELP);
      exit(2);
  }
}

async function runRegister(
  argv: readonly string[],
  opts: Required<Pick<ReposRunOptions, "print" | "printErr" | "exit">> & ReposRunOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;
  const flags = parseFlags(argv);
  const path = flags.get("path");
  const url = flags.get("url");

  if ((path && url) || (!path && !url)) {
    printErr("fulcrum repos register: provide exactly one of --path <dir> or --url <remote>");
    exit(1);
    return;
  }

  const input = path
    ? optionalRepoFields({ kind: "local" as const, path }, flags)
    : optionalRepoFields({ kind: "remote" as const, url: url as string }, flags);

  await callAndPrint("register", argv.includes("--json"), opts, async (caller) => caller.repos.register(input));
}

async function runList(
  argv: readonly string[],
  opts: Required<Pick<ReposRunOptions, "print" | "printErr" | "exit">> & ReposRunOptions,
): Promise<void> {
  const includeArchived = argv.includes("--include-archived");
  await callAndPrint(
    "list",
    argv.includes("--json"),
    opts,
    async (caller) => caller.repos.list(includeArchived ? { includeArchived: true } : undefined),
    (repos) => repos.map(toCliRepoRow),
  );
}

async function runSync(
  argv: readonly string[],
  opts: Required<Pick<ReposRunOptions, "print" | "printErr" | "exit">> & ReposRunOptions,
): Promise<void> {
  const id = repoIdArg(argv);
  if (!id) {
    opts.printErr("fulcrum repos sync: missing required argument <id>");
    opts.exit(1);
    return;
  }

  await callAndPrint("sync", argv.includes("--json"), opts, async (caller) => {
    const repo = caller.repos.syncRepo
      ? await caller.repos.syncRepo({ repoId: id })
      : await caller.repos.sync?.({ id });
    if (!repo) throw new Error(`repo not found: ${id}`);
    return repo;
  });
}

async function runRepoMutation(
  verb: "unregister",
  argv: readonly string[],
  opts: Required<Pick<ReposRunOptions, "print" | "printErr" | "exit">> & ReposRunOptions,
): Promise<void> {
  const id = repoIdArg(argv);
  if (!id) {
    opts.printErr(`fulcrum repos ${verb}: missing required argument <id>`);
    opts.exit(1);
    return;
  }

  await callAndPrint(verb, argv.includes("--json"), opts, async (caller) => {
    const repo = await caller.repos[verb]({ id });
    if (!repo) throw new Error(`repo not found: ${id}`);
    return repo;
  });
}

async function runStatus(
  argv: readonly string[],
  opts: Required<Pick<ReposRunOptions, "print" | "printErr" | "exit">> & ReposRunOptions,
): Promise<void> {
  const id = repoIdArg(argv);
  if (!id) {
    opts.printErr("fulcrum repos status: missing required argument <id>");
    opts.exit(1);
    return;
  }

  await callAndPrint("status", argv.includes("--json"), opts, async (caller) => {
    const repo = await caller.repos.get({ id });
    if (!repo) throw new Error(`repo not found: ${id}`);
    return repo;
  });
}

async function runRepoReadOnly(
  verb: "branches" | "commits" | "files",
  argv: readonly string[],
  opts: Required<Pick<ReposRunOptions, "print" | "printErr" | "exit">> & ReposRunOptions,
): Promise<void> {
  const id = repoIdArg(argv);
  if (!id) {
    opts.printErr(`fulcrum repos ${verb}: missing required argument <id>`);
    opts.exit(1);
    return;
  }

  await callAndPrint(verb, argv.includes("--json"), opts, async (caller) => {
    const fn = caller.repos[verb];
    if (!fn) throw new Error(`repos.${verb} is not available`);
    return fn({ id });
  });
}

async function callAndPrint<T>(
  verb: string,
  jsonMode: boolean,
  opts: Required<Pick<ReposRunOptions, "print" | "printErr" | "exit">> & ReposRunOptions,
  fn: (caller: ReposCaller) => Promise<T>,
  jsonShape?: (result: T) => unknown,
): Promise<void> {
  try {
    const caller = await resolveCaller(opts);
    const result = await fn(caller);
    if (jsonMode) {
      opts.print(JSON.stringify(jsonShape ? jsonShape(result) : result));
    } else {
      printHuman(result, opts.print);
    }
  } catch (err) {
    const msg = formatCliError(err);
    opts.printErr(`fulcrum repos ${verb}: ${msg}`);
    opts.exit(1);
  }
}

function parseFlags(argv: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item?.startsWith("--")) continue;
    const [rawName, inlineValue] = item.slice(2).split("=", 2);
    if (!rawName || rawName === "json" || rawName === "include-archived") continue;
    const next = inlineValue ?? argv[i + 1];
    if (next && !next.startsWith("--")) {
      flags.set(rawName, next);
      if (inlineValue === undefined) i += 1;
    }
  }
  return flags;
}

function firstPositional(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item) continue;
    if (!item.startsWith("-")) return item;
    if (item.includes("=")) continue;
    if (!["--json", "--include-archived", "-h", "--help"].includes(item)) i += 1;
  }
  return undefined;
}

function repoIdArg(argv: readonly string[]): string | undefined {
  return parseFlags(argv).get("id") ?? firstPositional(argv);
}

function optionalRepoFields<T extends { kind: "local" | "remote" }>(
  input: T,
  flags: Map<string, string>,
): T & { name?: string; slug?: string } {
  return {
    ...input,
    ...(flags.get("name") ? { name: flags.get("name") as string } : {}),
    ...(flags.get("slug") ? { slug: flags.get("slug") as string } : {}),
  };
}

function printHuman(result: unknown, print: (line: string) => void): void {
  if (!isRepoResult(result)) {
    print(JSON.stringify(result));
    return;
  }

  const repos = Array.isArray(result) ? result : [result];
  if (repos.length === 0) {
    print("No repos.");
    return;
  }

  const slugWidth = Math.max(...repos.map((repo) => repo.slug.length), 4);
  print(`${"SLUG".padEnd(slugWidth)}  KIND    BRANCH  SYNC     PATH/URL`);
  for (const repo of repos) {
    const target = repo.localPath ?? repo.path ?? repo.remoteUrl ?? "";
    print([
      repo.slug.padEnd(slugWidth),
      (repo.kind ?? "local").padEnd(6),
      (repo.branch ?? repo.currentBranch ?? repo.defaultBranch ?? "-").padEnd(6),
      (repo.syncStatus ?? repo.health ?? "-").padEnd(8),
      target,
    ].join("  "));
  }
}

function isRepoResult(result: unknown): result is RepoItem | RepoItem[] {
  const first = Array.isArray(result) ? result[0] : result;
  return !!first && typeof first === "object" && "slug" in first && "id" in first;
}

function toCliRepoRow(repo: RepoItem): RepoCliRow {
  return {
    id: repo.id,
    slug: repo.slug,
    branch: repo.branch ?? repo.currentBranch ?? repo.defaultBranch ?? null,
    dirty: repo.dirty ?? false,
    lastSyncAt: normalizeStamp(repo.lastSyncAt),
    openTaskCount: repo.openTaskCount ?? 0,
  };
}

function normalizeStamp(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

async function resolveCaller(opts: ReposRunOptions): Promise<ReposCaller> {
  if (opts.caller) return opts.caller;

  return await createLocalCaller({
    container: opts.container,
    requireSession: true,
  }) as unknown as ReposCaller;
}

function formatCliError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const code = String((err as { code: unknown }).code);
    const message = String((err as { message: unknown }).message);
    return `${code}: ${message}`;
  }
  return `Error: ${(err as Error).message}`;
}
