import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { formatApiError } from "../api-errors.ts";
import { emitResult } from "../lib/cli-output.ts";
import {
  createDocumentApiCallerFromEnv,
  type DocumentApiEnvironment,
} from "@knowledge-workspace/interface/http/document-api-client.ts";

type DocRow = Record<string, unknown>;
type DocumentApiCaller = NonNullable<ReturnType<typeof createDocumentApiCallerFromEnv>>;

type DocsCaller = {
  docs: {
    list: (input?: Record<string, unknown>) => Promise<DocRow[]>;
    get: (input: Record<string, unknown>) => Promise<DocRow | null>;
    create: (input: Record<string, unknown>) => Promise<DocRow>;
    update: (input: Record<string, unknown>) => Promise<DocRow | null>;
    delete: (input: Record<string, unknown>) => Promise<DocRow | { deleted: true } | null>;
    search?: (input: Record<string, unknown>) => Promise<unknown>;
    versionsList?: (input: Record<string, unknown>) => Promise<DocRow[]>;
    restoreVersion?: (input: Record<string, unknown>) => Promise<DocRow | null>;
    attach?: (input: Record<string, unknown>) => Promise<DocRow>;
    comment?: (input: Record<string, unknown>) => Promise<DocRow>;
    link?: (input: Record<string, unknown>) => Promise<DocRow>;
    templates?: {
      list: (input: Record<string, unknown>) => Promise<DocRow[]>;
    };
  };
};

export interface DocsRunOptions {
  caller?: DocsCaller;
  env?: DocumentApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum docs

Capture stage — docs tree, freeform editor, and intake documents
(CLI-TUI-UX.md §1.1 'fulcrum doc' grammar).

Usage:
  fulcrum docs list [--type <type>] [--scope <scope>] [--project <id>] [--archived] [--limit <n>] [--offset <n>] [--json]
  fulcrum docs new --title <title> [--type <type>] [--scope <scope>] [--project <id>] [--parent <id>] [--body <markdown>] [--json]
  fulcrum docs view <slug|id> [--json]
  fulcrum docs edit <slug|id> [--editor <cmd>] [--json]
  fulcrum docs attach <slug|id> <file> [--json]
  fulcrum docs history <doc-id> [--json]
  fulcrum docs restore <doc-id> --version <n> [--json]
  fulcrum docs comment <slug|id> --body <text> [--resolve <comment-id>] [--json]
  fulcrum docs link <slug|id> --task <task-id> [--json]
  fulcrum docs search <query> [--type <type>] [--scope <scope>] [--limit <n>] [--json]
  fulcrum docs delete <id> [--hard --yes] [--json]
  fulcrum docs template list [--json]

Aliases (compatibility — old names keep working):
  create -> new      get -> view      versions list -> history

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
  --jq <expr>       Filter the envelope's .result through jq
  --json-raw        Pre-envelope JSON payload (compatibility, removed next release)
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
        emitDocs(result, "fulcrum doc list", rest, resolved.print, formatRows);
      });
    // `view` is the CLI-TUI-UX §1.1 verb; `get` stays as a documented alias.
    case "view":
    case "get":
      return withErrors(sub, resolved, async () => {
        const key = requireArg(rest, 0, sub, "<slug|id>");
        const caller = await resolveCaller(resolved);
        const result = await caller.docs.get(docLookup(key));
        emitDocs(result, "fulcrum doc view", rest, resolved.print, formatRow);
      });
    // `new` is the CLI-TUI-UX §1.1 verb; `create` stays as a documented alias.
    case "new":
    case "create":
      return withErrors(sub, resolved, async () => {
        const caller = await resolveCaller(resolved);
        const result = await caller.docs.create(parseCreateInput(rest));
        emitDocs(result, "fulcrum doc new", rest, resolved.print, formatRow);
      });
    case "edit":
      return withErrors("edit", resolved, async () => {
        await runEdit(rest, resolved);
      });
    case "attach":
      return withErrors("attach", resolved, async () => {
        await runAttach(rest, resolved);
      });
    // `history` is the CLI-TUI-UX §1.1 verb; `versions list` stays as an alias.
    case "history":
      return withErrors("history", resolved, async () => {
        await runHistory(rest, resolved);
      });
    case "restore":
      return withErrors("restore", resolved, async () => {
        await runRestore(rest, resolved);
      });
    case "comment":
      return withErrors("comment", resolved, async () => {
        await runComment(rest, resolved);
      });
    case "link":
      return withErrors("link", resolved, async () => {
        await runLink(rest, resolved);
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
        if (!caller.docs.templates?.list) throw new Error("docs template list operation is not available");
        const result = await caller.docs.templates.list({});
        emitDocs(result, "fulcrum doc template list", rest, opts.print, formatRows);
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

/** `fulcrum docs versions list <id>` — compatibility alias for `fulcrum docs history`. */
async function runVersions(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const [sub = "help", ...rest] = argv;
  switch (sub) {
    case "list":
      return withErrors("versions list", opts, async () => {
        await runHistory(rest, opts);
      });
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

/** `fulcrum docs history <doc-id>` — version history of one document (`CLI-TUI-UX.md` §1.1). */
async function runHistory(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const docId = requireArg(argv, 0, "history", "<doc-id>");
  const caller = await resolveCaller(opts);
  if (!caller.docs.versionsList) throw new Error("docs version history operation is not available");
  const result = await caller.docs.versionsList({ docId });
  emitDocs(result, "fulcrum doc history", argv, opts.print, formatRows);
}

/** `fulcrum docs restore <doc-id> --version <n>` — restore a prior version (`CLI-TUI-UX.md` §1.1). */
async function runRestore(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const docId = requireArg(argv, 0, "restore", "<doc-id>");
  const version = flagValue(argv, "--version");
  if (!version) throw new Error("fulcrum docs restore: missing required flag --version <n>");
  const caller = await resolveCaller(opts);
  if (!caller.docs.restoreVersion) throw new Error("docs restore operation is not available");
  const result = await caller.docs.restoreVersion({ docId, version });
  emitDocs(result, "fulcrum doc restore", argv, opts.print, formatRow);
}

/** `fulcrum docs attach <slug|id> <file>` — record an attachment on a doc (`CLI-TUI-UX.md` §1.1). */
async function runAttach(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const key = requireArg(argv, 0, "attach", "<slug|id>");
  const file = requireArg(argv, 1, "attach", "<file>");
  const caller = await resolveCaller(opts);
  if (!caller.docs.attach) throw new Error("docs attach operation is not available");
  const doc = await caller.docs.get(docLookup(key));
  if (!doc) throw new Error("Document not found.");
  const id = requireDocId(doc);
  const result = await caller.docs.attach({
    docId: id,
    fileName: file.split("/").pop() ?? file,
    storagePath: file,
  });
  emitDocs(result, "fulcrum doc attach", argv, opts.print, () => `Attached ${file} to doc ${id}.`);
}

/** `fulcrum docs comment <slug|id> --body <text>` — add a thread comment (`CLI-TUI-UX.md` §1.1). */
async function runComment(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const key = requireArg(argv, 0, "comment", "<slug|id>");
  const body = flagValue(argv, "--body");
  if (!body) throw new Error("fulcrum docs comment: missing required flag --body <text>");
  const caller = await resolveCaller(opts);
  if (!caller.docs.comment) throw new Error("docs comment operation is not available");
  const doc = await caller.docs.get(docLookup(key));
  if (!doc) throw new Error("Document not found.");
  const id = requireDocId(doc);
  const result = await caller.docs.comment(
    compact({
      docId: id,
      bodyMd: body,
      resolveCommentId: flagValue(argv, "--resolve"),
    }),
  );
  emitDocs(result, "fulcrum doc comment", argv, opts.print, () => `Comment added to doc ${id}.`);
}

/** `fulcrum docs link <slug|id> --task <task-id>` — link a doc to a task (`CLI-TUI-UX.md` §1.1). */
async function runLink(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const key = requireArg(argv, 0, "link", "<slug|id>");
  const task = flagValue(argv, "--task");
  if (!task) throw new Error("fulcrum docs link: missing required flag --task <task-id>");
  const caller = await resolveCaller(opts);
  if (!caller.docs.link) throw new Error("docs link operation is not available");
  const doc = await caller.docs.get(docLookup(key));
  if (!doc) throw new Error("Document not found.");
  const id = requireDocId(doc);
  const result = await caller.docs.link({
    sourceDocId: id,
    targetKind: "task",
    targetId: task,
    linkType: "source",
  });
  emitDocs(result, "fulcrum doc link", argv, opts.print, () => `Linked doc ${id} to task ${task}.`);
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
    emitDocs(result, "fulcrum doc edit", argv, opts.print, formatRow);
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
  emitDocs(result, "fulcrum doc delete", argv, opts.print, () => hard ? `Deleted doc ${id}.` : `Archived doc ${id}.`);
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
  emitDocs(result, "fulcrum doc search", argv, opts.print, formatRows);
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

function requireDocId(doc: DocRow): string {
  const id = doc.id;
  if (typeof id !== "string" || id.length === 0) throw new Error("Document response is missing id.");
  return id;
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

/**
 * Emit a docs result through the canonical `fulcrum.cli.v1` envelope. Under
 * `--json` the payload is wrapped in the twelve-key envelope (`CLI-TUI-UX.md`
 * §3); `--json-raw` keeps the pre-envelope shape for one release; plain output
 * renders the caller-supplied human formatter over the same data.
 */
function emitDocs(
  value: unknown,
  command: string,
  argv: readonly string[],
  print: (line: string) => void,
  human: (value: unknown) => string,
): void {
  emitResult(
    {
      argv,
      command,
      result: value,
      renderHuman: (result) => print(human(result)),
    },
    { print, printErr: print },
  );
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
    const message = formatApiError(err);
    if (opts.printErr) opts.printErr(`fulcrum docs ${command}: ${message}`);
    opts.exit(1);
  }
}

async function resolveCaller(opts: DocsRunOptions): Promise<DocsCaller> {
  if (opts.caller) return opts.caller;
  const apiCaller = createDocumentApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error("Document API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return {
    docs: {
      list: async (input = {}) => await apiCaller.docs.list(input) as DocRow[],
      get: async (input) => await getDocument(apiCaller, input),
      create: async (input) => await apiCaller.docs.create(input) as DocRow,
      update: async (input) => await apiCaller.docs.update(requireDocumentId(input)) as DocRow | null,
      delete: async (input) => await apiCaller.docs.delete(requireDocumentId(input)) as DocRow | { deleted: true } | null,
      versionsList: async (input) => await apiCaller.docs.listVersions({
        id: String(input.docId ?? input.id ?? ""),
      }) as DocRow[],
      restoreVersion: async (input) => await apiCaller.docs.restoreVersion({
        id: String(input.docId ?? input.id ?? ""),
        version: String(input.version ?? ""),
      }) as DocRow | null,
      attach: async (input) => await apiCaller.docs.createAttachment(
        input as Parameters<typeof apiCaller.docs.createAttachment>[0],
      ) as DocRow,
      comment: async (input) => await apiCaller.docs.createComment(
        input as Parameters<typeof apiCaller.docs.createComment>[0],
      ) as DocRow,
      link: async (input) => await apiCaller.docs.createLink(input) as DocRow,
      templates: {
        list: async (input) => await apiCaller.docs.listTemplates(input) as DocRow[],
      },
    },
  };
}

async function getDocument(
  apiCaller: DocumentApiCaller,
  input: Record<string, unknown>,
): Promise<DocRow | null> {
  const id = input.id;
  if (typeof id === "string" && id.length > 0) {
    return await apiCaller.docs.get({ id }) as DocRow | null;
  }

  const slug = input.slug;
  if (typeof slug !== "string" || slug.length === 0) return null;
  const docs = await apiCaller.docs.list({}) as DocRow[];
  return docs.find((doc) => doc.slug === slug || doc.id === slug) ?? null;
}

function requireDocumentId(input: Record<string, unknown>): Record<string, unknown> & { id: string } {
  const id = input.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Document id is required.");
  }
  return { ...input, id };
}
