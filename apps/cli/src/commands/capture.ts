import { apiErrorCode, formatApiError } from "../api-errors.ts";
import { emitErrorResult, emitResult } from "../lib/cli-output.ts";

type CaptureStatus = "triage" | "review" | "approved";
type CaptureQuickAction = "assign" | "block" | "approve" | "escalate";

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

export interface CaptureCommandResult {
  captureId: string;
  status: CaptureStatus;
  action: "review" | "status" | CaptureQuickAction;
  traceId: string;
  message: string;
}

export interface CaptureCaller {
  capture: {
    submitReview(input: CaptureReviewInput): Promise<CaptureCommandResult>;
    setStatus(input: CaptureStatusInput): Promise<CaptureCommandResult>;
    runQuickAction(input: CaptureQuickActionInput): Promise<CaptureCommandResult>;
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

const HELP = `fulcrum capture <review|status|action> [options]

Usage:
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
    },
  };
}

async function request(fetchFn: typeof fetch, url: string, input: CaptureReviewInput | CaptureStatusInput | CaptureQuickActionInput): Promise<CaptureCommandResult> {
  const response = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`Capture API request failed with ${response.status}.`);
  return await response.json() as CaptureCommandResult;
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

/** A 32-char lowercase-hex trace id passes through; anything else stays unset. */
function normalizeTraceId(value: string | undefined): string | undefined {
  return value && /^[0-9a-f]{32}$/i.test(value) ? value.toLowerCase() : undefined;
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

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
