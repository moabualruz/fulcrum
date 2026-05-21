import { apiErrorCode, formatApiError } from "../api-errors.ts";
import { emitErrorResult, emitResult } from "../lib/cli-output.ts";

type CaptureStatus = "triage" | "review" | "approved";
type CaptureQuickAction = "assign" | "block" | "approve" | "escalate";
type CaptureIntakeKind = "text" | "url" | "file";
type CaptureInboxAction = "snooze" | "accept" | "decline";

export interface CaptureReviewInput {
  captureId: string;
  note: string;
  traceId?: string;
}

export interface CaptureStatusInput {
  captureId: string;
  status: CaptureStatus;
  traceId?: string;
}

export interface CaptureQuickActionInput {
  captureId: string;
  action: CaptureQuickAction;
  assigneeId?: string;
  reason?: string;
  traceId?: string;
}

/** Freeform intake: `fulcrum capture text|url|file <value>` (`CLI-TUI-UX.md` §1.1). */
export interface CaptureIntakeInput {
  kind: CaptureIntakeKind;
  value: string;
  projectId?: string;
  traceId?: string;
}

/** Intake-queue triage: `fulcrum capture inbox [--snooze|--accept|--decline] <id>`. */
export interface CaptureInboxInput {
  captureId: string;
  action: CaptureInboxAction;
  traceId?: string;
}

/** Short-form note intake: `fulcrum capture note new <text>` / `note list`. */
export interface CaptureNoteCreateInput {
  text: string;
  projectId?: string;
  traceId?: string;
}

export interface CaptureNoteListInput {
  tag?: string;
  projectId?: string;
}

export interface CaptureCommandResult {
  captureId: string;
  status: CaptureStatus;
  action: "review" | "status" | CaptureQuickAction;
  traceId: string;
  message: string;
}

/** Result of an intake / inbox / note write: carries the trace for cross-surface follow. */
export interface CaptureIntakeResult {
  captureId: string;
  kind: CaptureIntakeKind | "note" | CaptureInboxAction;
  traceId: string;
  message: string;
}

/** One short-form note row returned by `fulcrum capture note list`. */
export interface CaptureNoteRow {
  id: string;
  text: string;
  tag?: string;
}

export interface CaptureCaller {
  capture: {
    submitReview(input: CaptureReviewInput): Promise<CaptureCommandResult>;
    setStatus(input: CaptureStatusInput): Promise<CaptureCommandResult>;
    runQuickAction(input: CaptureQuickActionInput): Promise<CaptureCommandResult>;
    // Intake / inbox / note verbs are optional on the seam so existing partial
    // callers (review-only fixtures) still satisfy the interface; the env-backed
    // caller always provides them, and a missing one throws a clear CLI error.
    intake?(input: CaptureIntakeInput): Promise<CaptureIntakeResult>;
    triageInbox?(input: CaptureInboxInput): Promise<CaptureIntakeResult>;
    createNote?(input: CaptureNoteCreateInput): Promise<CaptureIntakeResult>;
    listNotes?(input: CaptureNoteListInput): Promise<CaptureNoteRow[]>;
  };
}

export interface CaptureApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
}

export interface CaptureRunOptions {
  caller?: CaptureCaller;
  env?: CaptureApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum capture <verb> [options]

Capture stage: intake, triage, and review of mobile/inbox captures
(CLI-TUI-UX.md §1.1).

Usage:
  fulcrum capture text   <text> [--project <id>] [--trace <id>] [--json]
  fulcrum capture url    <url> [--project <id>] [--trace <id>] [--json]
  fulcrum capture file   <path> [--project <id>] [--trace <id>] [--json]
  fulcrum capture inbox  [--snooze|--accept|--decline] <id> [--trace <id>] [--json]
  fulcrum capture note   new <text> [--project <id>] [--trace <id>] [--json]
  fulcrum capture note   list [--tag <tag>] [--project <id>] [--json]
  fulcrum capture review <id> --note <text> [--trace <id>] [--json]
  fulcrum capture status <id> --status <triage|review|approved> [--trace <id>] [--json]
  fulcrum capture action <id> --action <assign|block|approve|escalate> [--assignee <id>] [--reason <text>] [--trace <id>] [--json]

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
  --jq <expr>       Filter the envelope's .result through jq
  --json-raw        Pre-envelope JSON payload (compatibility, removed next release)
`;

export async function run(argv: readonly string[], opts: CaptureRunOptions = {}): Promise<void> {
  const io = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const [verb = "help", ...rest] = argv;

  try {
    switch (verb) {
      case "text":
      case "url":
      case "file": {
        const caller = await resolveCaller(opts);
        const intake = requireOperation(caller.capture.intake, `capture ${verb}`);
        const result = await intake({
          kind: verb,
          value: requiredArg(
            rest,
            `capture ${verb}`,
            verb === "url" ? "<url>" : verb === "file" ? "<path>" : "<text>",
          ),
          projectId: flagValue(rest, "--project"),
          traceId: flagValue(rest, "--trace"),
        });
        printIntake(result, `fulcrum capture ${verb}`, rest, io.print, opts.env);
        return;
      }
      case "inbox": {
        const caller = await resolveCaller(opts);
        const triageInbox = requireOperation(caller.capture.triageInbox, "capture inbox");
        const result = await triageInbox({
          captureId: requiredArg(rest, "capture inbox", "<id>"),
          action: parseInboxAction(rest),
          traceId: flagValue(rest, "--trace"),
        });
        printIntake(result, "fulcrum capture inbox", rest, io.print, opts.env);
        return;
      }
      case "note": {
        await runNote(rest, opts, io);
        return;
      }
      case "review": {
        const caller = await resolveCaller(opts);
        const result = await caller.capture.submitReview({
          captureId: requiredArg(rest, "review", "<id>"),
          note: requiredFlag(rest, "--note", "review"),
          traceId: flagValue(rest, "--trace"),
        });
        printOutput(result, "fulcrum capture review", rest, io.print, opts.env);
        return;
      }
      case "status": {
        const caller = await resolveCaller(opts);
        const result = await caller.capture.setStatus({
          captureId: requiredArg(rest, "status", "<id>"),
          status: parseStatus(requiredFlag(rest, "--status", "status")),
          traceId: flagValue(rest, "--trace"),
        });
        printOutput(result, "fulcrum capture status", rest, io.print, opts.env);
        return;
      }
      case "action":
      case "quick-action": {
        const caller = await resolveCaller(opts);
        const result = await caller.capture.runQuickAction({
          captureId: requiredArg(rest, verb, "<id>"),
          action: parseAction(requiredFlag(rest, "--action", verb)),
          assigneeId: flagValue(rest, "--assignee"),
          reason: flagValue(rest, "--reason"),
          traceId: flagValue(rest, "--trace"),
        });
        printOutput(result, `fulcrum capture ${verb}`, rest, io.print, opts.env);
        return;
      }
      case "help":
      case "--help":
      case "-h":
        io.print(HELP);
        return;
      default:
        io.printErr(`fulcrum capture: unknown command '${verb}'`);
        io.printErr(HELP);
        io.exit(2);
    }
  } catch (error) {
    // The failure carries recovery copy + the trace reference (COPY.md §3 /
    // CLI-TUI-UX §5) so a CLI error is followable in web / TUI by the same id.
    emitErrorResult(
      {
        argv: rest,
        command: `fulcrum capture ${verb}`,
        error: {
          code: apiErrorCode(error) ?? "FUL_CAPTURE_FAILED",
          message: `fulcrum capture ${verb}: ${formatApiError(error)}`,
          fix: "fulcrum capture --help",
        },
        env: opts.env as NodeJS.ProcessEnv | undefined,
        renderHuman: () => io.printErr(`fulcrum capture ${verb}: ${formatApiError(error)}`),
      },
      io,
    );
    io.exit(1);
  }
}

/** `fulcrum capture note <new|list>`: short-form intake (`CLI-TUI-UX.md` §1.1). */
async function runNote(
  argv: readonly string[],
  opts: CaptureRunOptions,
  io: { print: (line: string) => void; printErr: (line: string) => void; exit: (code: number) => void },
): Promise<void> {
  const [sub = "help", ...rest] = argv;
  switch (sub) {
    case "new": {
      const caller = await resolveCaller(opts);
      const createNote = requireOperation(caller.capture.createNote, "capture note new");
      const result = await createNote({
        text: requiredArg(rest, "capture note new", "<text>"),
        projectId: flagValue(rest, "--project"),
        traceId: flagValue(rest, "--trace"),
      });
      printIntake(result, "fulcrum capture note new", rest, io.print, opts.env);
      return;
    }
    case "list": {
      const caller = await resolveCaller(opts);
      const listNotes = requireOperation(caller.capture.listNotes, "capture note list");
      const rows = await listNotes({
        tag: flagValue(rest, "--tag"),
        projectId: flagValue(rest, "--project"),
      });
      emitResult(
        {
          argv: rest,
          command: "fulcrum capture note list",
          result: rows,
          renderHuman: (value) => {
            if (value.length === 0) {
              io.print("No notes yet.");
              return;
            }
            for (const row of value) {
              io.print(`${row.id}  ${row.tag ? `#${row.tag}  ` : ""}${row.text}`);
            }
          },
        },
        io,
      );
      return;
    }
    case "help":
    case "--help":
    case "-h":
      io.print(HELP);
      return;
    default:
      io.printErr(`fulcrum capture note: unknown command '${sub}'`);
      io.printErr(HELP);
      io.exit(2);
  }
}

async function resolveCaller(opts: CaptureRunOptions): Promise<CaptureCaller> {
  if (opts.caller) return opts.caller;

  const env = opts.env ?? process.env;
  const baseUrl = env.FULCRUM_PUBLIC_API_URL ?? env.FULCRUM_SERVER_URL;
  if (!baseUrl) {
    throw new Error("Capture API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }

  const fetchFn = opts.fetch ?? fetch;
  const apiRoot = new URL("/api/v1/captures/", ensureTrailingSlash(baseUrl)).toString();
  return {
    capture: {
      submitReview: (input) => request(fetchFn, `${apiRoot}${encodeURIComponent(input.captureId)}/reviews`, input),
      setStatus: (input) => request(fetchFn, `${apiRoot}${encodeURIComponent(input.captureId)}/status`, input),
      runQuickAction: (input) => request(fetchFn, `${apiRoot}${encodeURIComponent(input.captureId)}/quick-actions`, input),
      intake: (input) => requestIntake(fetchFn, `${apiRoot}intake`, input),
      triageInbox: (input) =>
        requestIntake(fetchFn, `${apiRoot}inbox/${encodeURIComponent(input.captureId)}/${input.action}`, input),
      createNote: (input) => requestIntake(fetchFn, `${apiRoot}notes`, input),
      listNotes: async (input) => {
        const url = new URL(`${apiRoot}notes`);
        if (input.tag) url.searchParams.set("tag", input.tag);
        if (input.projectId) url.searchParams.set("projectId", input.projectId);
        const response = await fetchFn(url.toString(), { method: "GET" });
        if (!response.ok) throw new Error(`Capture API request failed with ${response.status}.`);
        return (await response.json()) as CaptureNoteRow[];
      },
    },
  };
}

async function request(
  fetchFn: typeof fetch,
  url: string,
  input: CaptureReviewInput | CaptureStatusInput | CaptureQuickActionInput,
): Promise<CaptureCommandResult> {
  const response = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Capture API request failed with ${response.status}.`);
  return (await response.json()) as CaptureCommandResult;
}

async function requestIntake(
  fetchFn: typeof fetch,
  url: string,
  input: CaptureIntakeInput | CaptureInboxInput | CaptureNoteCreateInput,
): Promise<CaptureIntakeResult> {
  const response = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Capture API request failed with ${response.status}.`);
  return (await response.json()) as CaptureIntakeResult;
}

function printOutput(
  result: CaptureCommandResult,
  command: string,
  argv: readonly string[],
  print: (line: string) => void,
  env: CaptureApiEnvironment | undefined,
): void {
  // `--json` wraps the same `result` data in the canonical `fulcrum.cli.v1`
  // envelope; plain output renders the same fields plus the DESIGN.md §4.10
  // trace header line. The result's own trace id propagates into both surfaces
  // so a capture action started here is followable in web / TUI by the same id.
  emitResult(
    {
      argv,
      command,
      result,
      trace: { trace_id: normalizeTraceId(result.traceId) },
      traceLine: true,
      env: env as NodeJS.ProcessEnv | undefined,
      renderHuman: (value) => {
        print(`${value.captureId} ${value.status} ${value.action}`);
        print(value.message);
      },
    },
    { print, printErr: print },
  );
}

/** Render an intake / inbox / note-create result through the same canonical envelope. */
function printIntake(
  result: CaptureIntakeResult,
  command: string,
  argv: readonly string[],
  print: (line: string) => void,
  env: CaptureApiEnvironment | undefined,
): void {
  emitResult(
    {
      argv,
      command,
      result,
      trace: { trace_id: normalizeTraceId(result.traceId) },
      traceLine: true,
      env: env as NodeJS.ProcessEnv | undefined,
      renderHuman: (value) => {
        print(`${value.captureId} ${value.kind}`);
        print(value.message);
      },
    },
    { print, printErr: print },
  );
}

/** A 32-char lowercase-hex trace id passes through; anything else stays unset. */
function normalizeTraceId(value: string | undefined): string | undefined {
  return value && /^[0-9a-f]{32}$/i.test(value) ? value.toLowerCase() : undefined;
}

/**
 * Resolve an optional caller operation, throwing a clear CLI error when a
 * caller seam does not implement it. The env-backed caller always supplies the
 * full surface; only a partial test/integration caller can omit one.
 */
function requireOperation<T>(operation: T | undefined, command: string): T {
  if (!operation) throw new Error(`fulcrum ${command} is not available on the configured capture caller`);
  return operation;
}

function requiredArg(argv: readonly string[], command: string, label: string): string {
  const value = argv.find((arg) => !arg.startsWith("-"));
  if (!value) throw new Error(`missing required argument ${label} for ${command}`);
  return value;
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("-") ? value : undefined;
}

function requiredFlag(argv: readonly string[], flag: string, command: string): string {
  const value = flagValue(argv, flag);
  if (!value) throw new Error(`missing required flag ${flag} for ${command}`);
  return value;
}

function parseStatus(value: string): CaptureStatus {
  if (value === "triage" || value === "review" || value === "approved") return value;
  throw new Error(`invalid --status '${value}'`);
}

function parseAction(value: string): CaptureQuickAction {
  if (value === "assign" || value === "block" || value === "approve" || value === "escalate") return value;
  throw new Error(`invalid --action '${value}'`);
}

/**
 * Resolve the intake-queue triage action from the `--snooze|--accept|--decline`
 * flags (`CLI-TUI-UX.md` §1.1). Exactly one must be present.
 */
function parseInboxAction(argv: readonly string[]): CaptureInboxAction {
  const flags: CaptureInboxAction[] = [];
  if (argv.includes("--snooze")) flags.push("snooze");
  if (argv.includes("--accept")) flags.push("accept");
  if (argv.includes("--decline")) flags.push("decline");
  if (flags.length === 0) throw new Error("capture inbox requires one of --snooze, --accept, or --decline");
  if (flags.length > 1) throw new Error("capture inbox accepts only one of --snooze, --accept, or --decline");
  return flags[0]!;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
