import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TRPCError } from "@trpc/server";
import { Container } from "@needle-di/core";
import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";
import type { Session as BetterAuthSession } from "better-auth";

import {
  ENTITY_MANAGER_TOKEN,
  registerDbBindings,
} from "../../db/db.module.ts";

type DocRow = Record<string, unknown>;

type DocsCaller = {
  docs: {
    list: (input?: Record<string, unknown>) => Promise<DocRow[]>;
    get: (input: Record<string, unknown>) => Promise<DocRow | null>;
    create: (input: Record<string, unknown>) => Promise<DocRow>;
    update: (input: Record<string, unknown>) => Promise<DocRow | null>;
    delete: (input: Record<string, unknown>) => Promise<DocRow | { deleted: true } | null>;
    search?: (input: Record<string, unknown>) => Promise<unknown>;
    templates?: {
      list: (input: Record<string, unknown>) => Promise<DocRow[]>;
    };
  };
};

interface CliSession {
  id: string;
  token: string;
  userId: string;
  orgId: string;
  activeOrganizationId?: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface DocsRunOptions {
  caller?: DocsCaller;
  container?: Container | null;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum docs

Docs commands.

Usage:
  fulcrum docs list [--type <type>] [--scope <scope>] [--archived] [--limit <n>] [--offset <n>] [--json]
  fulcrum docs get <slug|id> [--json]
  fulcrum docs create --title <title> [--type <type>] [--scope <scope>] [--project <id>] [--parent <id>] [--body <markdown>] [--json]
  fulcrum docs edit <slug|id> [--editor <cmd>] [--json]
  fulcrum docs delete <id> [--hard --yes] [--json]
  fulcrum docs search <query> [--type <type>] [--scope <scope>] [--limit <n>] [--json]
  fulcrum docs template list [--json]
`;

type ResolvedOptions = Required<Pick<DocsRunOptions, "print" | "printErr" | "exit">> & DocsRunOptions;

export async function run(
  argv: readonly string[],
  opts: DocsRunOptions = {},
): Promise<void> {
  const resolved: ResolvedOptions = {
    ...opts,
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const [sub = "help", ...rest] = argv;

  switch (sub) {
    case "list":
      return withErrors("list", resolved, async () => {
        const caller = await resolveCaller(resolved);
        const result = await caller.docs.list(parseListInput(rest));
        printOutput(result, rest, resolved.print, formatRows);
      });
    case "get":
      return withErrors("get", resolved, async () => {
        const key = requireArg(rest, 0, "get", "<slug|id>");
        const caller = await resolveCaller(resolved);
        const result = await caller.docs.get(docLookup(key));
        printOutput(result, rest, resolved.print, formatRow);
      });
    case "create":
      return withErrors("create", resolved, async () => {
        const caller = await resolveCaller(resolved);
        const result = await caller.docs.create(parseCreateInput(rest));
        printOutput(result, rest, resolved.print, formatRow);
      });
    case "edit":
      return withErrors("edit", resolved, async () => {
        await runEdit(rest, resolved);
      });
    case "delete":
      return withErrors("delete", resolved, async () => {
        await runDelete(rest, resolved);
      });
    case "search":
      return withErrors("search", resolved, async () => {
        await runSearch(rest, resolved);
      });
    case "template":
      return runTemplate(rest, resolved);
    case "help":
    case "--help":
    case "-h":
      resolved.print(HELP);
      return;
    default:
      resolved.printErr(`fulcrum docs: unknown command '${sub}'`);
      resolved.printErr(HELP);
      resolved.exit(2);
  }
}

async function runTemplate(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const [sub = "help", ...rest] = argv;
  switch (sub) {
    case "list":
      return withErrors("template list", opts, async () => {
        const caller = await resolveCaller(opts);
        if (!caller.docs.templates?.list) throw new Error("docs.templates.list procedure is not available");
        const result = await caller.docs.templates.list({});
        printOutput(result, rest, opts.print, formatRows);
      });
    case "help":
    case "--help":
    case "-h":
      opts.print(HELP);
      return;
    default:
      opts.printErr(`fulcrum docs template: unknown command '${sub}'`);
      opts.printErr(HELP);
      opts.exit(2);
  }
}

async function runEdit(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const key = requireArg(argv, 0, "edit", "<slug|id>");
  const caller = await resolveCaller(opts);
  const doc = await caller.docs.get(docLookup(key));
  if (!doc) throw new Error("Document not found.");

  const id = doc.id;
  if (typeof id !== "string") throw new Error("Document response is missing id.");

  const scratch = await mkdtemp(join(tmpdir(), "fulcrum-docs-edit-"));
  const file = join(scratch, `${String(doc.slug ?? id)}.md`);
  await writeFile(file, String(doc.bodyMd ?? ""));
  try {
    const editor = flagValue(argv, "--editor") ?? process.env.EDITOR;
    if (!editor) throw new Error("No editor configured. Set $EDITOR or pass --editor <cmd>.");
    const proc = Bun.spawn(["sh", "-c", `${editor} "$1"`, "fulcrum-docs-editor", file], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) throw new Error(`Editor exited with code ${exitCode}.`);

    const bodyMd = await readFile(file, "utf8");
    const result = await caller.docs.update({ id, bodyMd });
    printOutput(result, argv, opts.print, formatRow);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function runDelete(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const id = requireArg(argv, 0, "delete", "<id>");
  const hard = argv.includes("--hard");
  if (hard && !argv.includes("--yes")) {
    throw new Error("Hard delete requires --yes.");
  }

  const caller = await resolveCaller(opts);
  const result = await caller.docs.delete(compact({ id, hard: hard ? true : undefined }));
  printOutput(result, argv, opts.print, () => hard ? `Deleted doc ${id}.` : `Archived doc ${id}.`);
}

async function runSearch(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const query = requireArg(argv, 0, "search", "<query>");
  const input = compact({
    query,
    docType: flagValue(argv, "--type"),
    scope: flagValue(argv, "--scope"),
    limit: numberFlag(argv, "--limit"),
  });
  const caller = await resolveCaller(opts);
  const result = caller.docs.search
    ? await caller.docs.search(input)
    : await caller.docs.list({ ...input, query: undefined });
  printOutput(result, argv, opts.print, formatRows);
}

function parseListInput(argv: readonly string[]): Record<string, unknown> {
  return compact({
    docType: flagValue(argv, "--type"),
    scope: flagValue(argv, "--scope"),
    archived: argv.includes("--archived") ? true : undefined,
    limit: numberFlag(argv, "--limit"),
    offset: numberFlag(argv, "--offset"),
  });
}

function parseCreateInput(argv: readonly string[]): Record<string, unknown> {
  const title = flagValue(argv, "--title");
  if (!title) throw new Error("fulcrum docs create: missing required flag --title <title>");

  return compact({
    title,
    docType: flagValue(argv, "--type"),
    scope: flagValue(argv, "--scope"),
    projectId: flagValue(argv, "--project"),
    parentId: flagValue(argv, "--parent"),
    bodyMd: flagValue(argv, "--body"),
  });
}

function docLookup(value: string): Record<string, string> {
  return /^[0-9a-fA-F-]{36}$/.test(value) ? { id: value } : { slug: value };
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  return argv[index + 1];
}

function numberFlag(argv: readonly string[], flag: string): number | undefined {
  const value = flagValue(argv, flag);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative integer`);
  if ((flag === "--limit" || flag === "--top") && parsed === 0) throw new Error(`${flag} must be positive`);
  return parsed;
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function requireArg(argv: readonly string[], index: number, command: string, name: string): string {
  const value = argv[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`fulcrum docs ${command}: missing required argument ${name}`);
  }
  return value;
}

function printOutput(
  value: unknown,
  argv: readonly string[],
  print: (line: string) => void,
  human: (value: unknown) => string,
): void {
  print(argv.includes("--json") ? JSON.stringify(value) : human(value));
}

function formatRows(value: unknown): string {
  const rows = Array.isArray(value) ? value : [];
  if (rows.length === 0) return "No docs found.";
  return rows.map(formatRow).join("\n");
}

function formatRow(value: unknown): string {
  const row = value as DocRow | null;
  if (!row) return "No doc found.";
  return `${String(row.id ?? "")}  ${String(row.docType ?? "doc")}  ${String(row.title ?? row.slug ?? "")}`;
}

async function withErrors(
  command: string,
  opts: ResolvedOptions,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof TRPCError ? `${err.code}: ${err.message}` : (err as Error).message;
    if (opts.printErr) opts.printErr(`fulcrum docs ${command}: ${message}`);
    opts.exit(1);
  }
}

async function resolveCaller(opts: DocsRunOptions): Promise<DocsCaller> {
  if (opts.caller) return opts.caller;

  const { t } = await import("../../trpc/trpc.ts");
  const { appRouter } = await import("../../trpc/router.ts");
  const { createContext } = await import("../../trpc/context.ts");

  const cliContext = buildCliContext(opts.container ?? null);
  const { container, em } = cliContext;
  const session = await resolveActiveCliSession(em);
  if (!session) {
    throw new Error(
      "No active CLI session found. Run `fulcrum init` or `fulcrum auth login` before docs commands.",
    );
  }

  const orgId = session.activeOrganizationId ?? session.orgId;
  const userId = session.userId;
  if (!orgId || !userId) throw new Error("Active CLI session is missing orgId or userId. Re-authenticate.");

  const ctx = createContext({
    session: session as unknown as BetterAuthSession,
    orgId,
    userId,
    em,
    container,
  });
  const factory = t.createCallerFactory(appRouter);
  return factory(ctx) as unknown as DocsCaller;
}

function buildCliContext(container: Container | null): {
  container: Container | null;
  em: EntityManager | null;
} {
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

async function resolveActiveCliSession(em: EntityManager | null): Promise<CliSession | null> {
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
      userAgent: session.userAgent ?? null,
    };
  } catch {
    return null;
  }
}
