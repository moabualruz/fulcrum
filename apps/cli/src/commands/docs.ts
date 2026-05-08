import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TRPCError } from "@trpc/server";
import type { Container } from "@needle-di/core";

import { createLocalCaller } from "../local-caller.ts";

type DocRow = Record<string, unknown>;

type DocsCaller = {
  docs: {
    list: (input?: Record<string, unknown>) => Promise<DocRow[]>;
    get: (input: Record<string, unknown>) => Promise<DocRow | null>;
    create: (input: Record<string, unknown>) => Promise<DocRow>;
    update: (input: Record<string, unknown>) => Promise<DocRow | null>;
    delete: (input: Record<string, unknown>) => Promise<DocRow | { deleted: true } | null>;
    search?: (input: Record<string, unknown>) => Promise<unknown>;
    versionsList?: (input: Record<string, unknown>) => Promise<DocRow[]>;
    templates?: {
      list: (input: Record<string, unknown>) => Promise<DocRow[]>;
    };
  };
};

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
  fulcrum docs versions list <doc-id> [--json]
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
    case "versions":
      return runVersions(rest, resolved);
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

async function runVersions(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const [sub = "help", ...rest] = argv;
  switch (sub) {
    case "list": {
      const docId = requireArg(rest, 0, "versions list", "<doc-id>");
      return withErrors("versions list", opts, async () => {
        const caller = await resolveCaller(opts);
        if (!caller.docs.versionsList) throw new Error("docs.versionsList procedure is not available");
        const result = await caller.docs.versionsList({ docId });
        printOutput(result, rest, opts.print, formatRows);
      });
    }
    case "help":
    case "--help":
    case "-h":
      opts.print(HELP);
      return;
    default:
      opts.printErr(`fulcrum docs versions: unknown command '${sub}'`);
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
    projectId: flagValue(argv, "--project"),
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
  const fromTask = flagValue(argv, "--from-task");

  return compact({
    title,
    docType: flagValue(argv, "--type"),
    scope: flagValue(argv, "--scope"),
    projectId: flagValue(argv, "--project"),
    parentId: flagValue(argv, "--parent"),
    bodyMd: flagValue(argv, "--body"),
    source: fromTask ? { kind: "task", id: fromTask } : undefined,
    links: parseLinks(argv),
  });
}

function parseLinks(argv: readonly string[]): Array<{ targetKind: string; targetId: string; linkKind: string }> | undefined {
  const links = flagValues(argv, "--link")
    .map((value) => {
      const [targetKind, targetId] = value.split(":", 2);
      if (!targetKind || !targetId) throw new Error("--link must use <kind>:<id>");
      return { targetKind, targetId, linkKind: "source" };
    });
  return links.length > 0 ? links : undefined;
}

function docLookup(value: string): Record<string, string> {
  return /^[0-9a-fA-F-]{36}$/.test(value) ? { id: value } : { slug: value };
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  return argv[index + 1];
}

function flagValues(argv: readonly string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag && argv[index + 1]) values.push(argv[index + 1]!);
  }
  return values;
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
  return await createLocalCaller({
    container: opts.container,
    requireSession: true,
  }) as unknown as DocsCaller;
}
