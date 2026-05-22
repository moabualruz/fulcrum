/**
 * fulcrum Review-stage command tree.
 *
 * The Review workflow stage (CLI-TUI-UX.md §1.4, IA-MAP.md §2.4) exposes four
 * command groups that mirror the web Review workbench and TUI `:review` screen:
 *
 *   fulcrum review list | view | approve | request-changes
 *   fulcrum qa     run  | report
 *   fulcrum uat    run  | handoff | decision
 *   fulcrum e2e    run  | report
 *
 * Every verb routes through `emitResult` so `--json` wraps the same underlying
 * result data in the canonical `fulcrum.cli.v1` envelope, and plain output
 * prints the `DESIGN.md` §4.10 trace header line: the printed `trace_id` is
 * the SAME identity the envelope carries, so a Review action started here is
 * followable across web / CLI / TUI by one id.
 *
 * The verbs delegate to an injectable {@link ReviewStageCaller}; with no caller
 * a real API client is resolved from `FULCRUM_SERVER_URL` /
 * `FULCRUM_PUBLIC_API_URL`. Tests pass `opts.caller`: there are no production
 * mocks in this module.
 */

import { normalizeTraceId } from "@fulcrum/shared-dto";

import { apiErrorCode, formatApiError } from "../api-errors.ts";
import { emitErrorResult, emitResult } from "../lib/cli-output.ts";

/** The four Review-stage command groups (`CLI-TUI-UX.md` §1.4). */
export type ReviewDomain = "review" | "qa" | "uat" | "e2e";

/** Open / decided lifecycle state of a review item. */
export type ReviewStatus = "open" | "approved" | "rejected";

/** UAT / code-review decision verbs (`CLI-TUI-UX.md` §1.4 `uat decision`). */
export type ReviewDecision = "approve" | "request_changes" | "reject";

/** Test runner backing an `e2e run` (`CLI-TUI-UX.md` §1.4 `e2e run --runner`). */
export type E2eRunner = "bun" | "playwright";

/** Output format for the `qa report` artifact. */
export type QaReportFormat = "md" | "json";

/** `fulcrum review list` inputs. */
export interface ReviewListInput {
  status?: ReviewStatus;
  reviewerId?: string;
  traceId?: string;
}

/** `fulcrum review view` inputs. */
export interface ReviewViewInput {
  reviewId: string;
  traceId?: string;
}

/** `fulcrum review approve` / `request-changes` inputs. */
export interface ReviewDecisionInput {
  reviewId: string;
  message?: string;
  traceId?: string;
}

/** `fulcrum qa run` / `qa report` inputs. */
export interface QaRunInput {
  taskId: string;
  format?: QaReportFormat;
  traceId?: string;
}

/** `fulcrum uat run` / `uat handoff` inputs. */
export interface UatHandoffInput {
  taskId: string;
  traceId?: string;
}

/** `fulcrum uat decision` inputs. */
export interface UatDecisionInput {
  taskId: string;
  decision: ReviewDecision;
  feedback?: string;
  traceId?: string;
}

/** `fulcrum e2e run` inputs. */
export interface E2eRunInput {
  projectId: string;
  runner?: E2eRunner;
  planOnly?: boolean;
  traceId?: string;
}

/** `fulcrum e2e report` inputs. */
export interface E2eReportInput {
  runId: string;
  traceId?: string;
}

/** One row of the `review list` queue. */
export interface ReviewListItem {
  reviewId: string;
  title: string;
  status: ReviewStatus;
  reviewerId: string | null;
}

/** Shared outcome shape for every Review-stage verb. `traceId` propagates. */
export interface ReviewStageResult {
  domain: ReviewDomain;
  verb: string;
  /** Subject id: review id, task id, project id, or run id by verb. */
  subjectId: string | null;
  status: ReviewStatus | "pending";
  traceId: string;
  message: string;
  /** Verb-specific payload: queue rows for `review list`, report path, etc. */
  details?: Record<string, unknown>;
}

/** The injectable API surface every Review-stage verb delegates to. */
export interface ReviewStageCaller {
  review: {
    list(input: ReviewListInput): Promise<ReviewStageResult & { details: { items: ReviewListItem[] } }>;
    view(input: ReviewViewInput): Promise<ReviewStageResult>;
    approve(input: ReviewDecisionInput): Promise<ReviewStageResult>;
    requestChanges(input: ReviewDecisionInput): Promise<ReviewStageResult>;
  };
  qa: {
    run(input: QaRunInput): Promise<ReviewStageResult>;
    report(input: QaRunInput): Promise<ReviewStageResult>;
  };
  uat: {
    run(input: UatHandoffInput): Promise<ReviewStageResult>;
    handoff(input: UatHandoffInput): Promise<ReviewStageResult>;
    decision(input: UatDecisionInput): Promise<ReviewStageResult>;
  };
  e2e: {
    run(input: E2eRunInput): Promise<ReviewStageResult>;
    report(input: E2eReportInput): Promise<ReviewStageResult>;
  };
}

/** Environment variables that locate the Review API. */
export interface ReviewStageApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
}

/** Options for {@link run}: injectable caller, env, IO sinks, fetch seam. */
export interface ReviewStageRunOptions {
  caller?: ReviewStageCaller;
  env?: ReviewStageApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum <review|qa|uat|e2e> <verb> [options]

Review stage: quality gates mirroring the web Review workbench (CLI-TUI-UX §1.4).

Usage:
  fulcrum review list             [--status open|approved|rejected] [--reviewer <id>]
  fulcrum review view             <id>
  fulcrum review approve          <id> [--message <text>]
  fulcrum review request-changes  <id> --message <text>

  fulcrum qa run                  --task <id>
  fulcrum qa report               --task <id> [--format md|json]

  fulcrum uat run                 --task <id>
  fulcrum uat handoff             <id>
  fulcrum uat decision            <id> --decision approve|request_changes|reject [--feedback <text>]

  fulcrum e2e run                 --project <id> [--runner bun|playwright] [--plan-only]
  fulcrum e2e report              <run-id>

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
  --jq <expr>       Filter the envelope's .result through jq
  --json-raw        Pre-envelope JSON payload (compatibility, removed next release)
`;

/** The verbs each Review-stage domain accepts: used by help + dispatch. */
export const REVIEW_STAGE_VERBS: Readonly<Record<ReviewDomain, readonly string[]>> = {
  review: ["list", "view", "approve", "request-changes"],
  qa: ["run", "report"],
  uat: ["run", "handoff", "decision"],
  e2e: ["run", "report"],
};

/**
 * Dispatch one Review-stage command. `domain` is `review|qa|uat|e2e`; `argv` is
 * the remaining tokens (`<verb> [args]`). Every verb emits the canonical
 * `fulcrum.cli.v1` envelope under `--json`.
 */
export async function run(
  domain: ReviewDomain,
  argv: readonly string[],
  opts: ReviewStageRunOptions = {},
): Promise<void> {
  const io = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const [verb = "help", ...rest] = argv;

  if (verb === "help" || verb === "--help" || verb === "-h") {
    io.print(HELP);
    return;
  }

  try {
    const result = await dispatch(domain, verb, rest, opts);
    printOutput(result, `fulcrum ${domain} ${verb}`, rest, io.print, opts.env);
  } catch (error) {
    // The failure carries recovery copy + the trace reference (COPY.md §3 /
    // CLI-TUI-UX §5) so a Review CLI error is followable in web / TUI by one id.
    if (error instanceof UnknownReviewVerbError) {
      io.printErr(`fulcrum ${domain}: unknown verb '${verb}'`);
      io.printErr(`Known ${domain} verbs: ${REVIEW_STAGE_VERBS[domain].join(", ")}`);
      io.printErr(HELP);
      io.exit(2);
      return;
    }
    emitErrorResult(
      {
        argv: rest,
        command: `fulcrum ${domain} ${verb}`,
        error: {
          code: apiErrorCode(error) ?? "FUL_REVIEW_FAILED",
          message: `fulcrum ${domain} ${verb}: ${formatApiError(error)}`,
          fix: `fulcrum ${domain} --help`,
        },
        env: opts.env as NodeJS.ProcessEnv | undefined,
        renderHuman: () => io.printErr(`fulcrum ${domain} ${verb}: ${formatApiError(error)}`),
      },
      io,
    );
    io.exit(1);
  }
}

/** Thrown when a Review-stage domain receives a verb it does not own. */
export class UnknownReviewVerbError extends Error {
  constructor(domain: ReviewDomain, verb: string) {
    super(`unknown ${domain} verb '${verb}'`);
    this.name = "UnknownReviewVerbError";
  }
}

async function dispatch(
  domain: ReviewDomain,
  verb: string,
  rest: readonly string[],
  opts: ReviewStageRunOptions,
): Promise<ReviewStageResult> {
  const caller = await resolveCaller(opts);
  switch (domain) {
    case "review":
      return dispatchReview(caller, verb, rest);
    case "qa":
      return dispatchQa(caller, verb, rest);
    case "uat":
      return dispatchUat(caller, verb, rest);
    case "e2e":
      return dispatchE2e(caller, verb, rest);
    default:
      throw new UnknownReviewVerbError(domain, verb);
  }
}

async function dispatchReview(
  caller: ReviewStageCaller,
  verb: string,
  rest: readonly string[],
): Promise<ReviewStageResult> {
  switch (verb) {
    case "list":
      return caller.review.list({
        status: optionalReviewStatus(flagValue(rest, "--status")),
        reviewerId: flagValue(rest, "--reviewer"),
        traceId: flagValue(rest, "--trace"),
      });
    case "view":
      return caller.review.view({
        reviewId: requiredArg(rest, "review view", "<id>"),
        traceId: flagValue(rest, "--trace"),
      });
    case "approve":
      return caller.review.approve({
        reviewId: requiredArg(rest, "review approve", "<id>"),
        message: flagValue(rest, "--message"),
        traceId: flagValue(rest, "--trace"),
      });
    case "request-changes":
      return caller.review.requestChanges({
        reviewId: requiredArg(rest, "review request-changes", "<id>"),
        message: requiredFlag(rest, "--message", "review request-changes"),
        traceId: flagValue(rest, "--trace"),
      });
    default:
      throw new UnknownReviewVerbError("review", verb);
  }
}

async function dispatchQa(
  caller: ReviewStageCaller,
  verb: string,
  rest: readonly string[],
): Promise<ReviewStageResult> {
  switch (verb) {
    case "run":
      return caller.qa.run({
        taskId: requiredFlag(rest, "--task", "qa run"),
        traceId: flagValue(rest, "--trace"),
      });
    case "report":
      return caller.qa.report({
        taskId: requiredFlag(rest, "--task", "qa report"),
        format: parseQaReportFormat(flagValue(rest, "--format")),
        traceId: flagValue(rest, "--trace"),
      });
    default:
      throw new UnknownReviewVerbError("qa", verb);
  }
}

async function dispatchUat(
  caller: ReviewStageCaller,
  verb: string,
  rest: readonly string[],
): Promise<ReviewStageResult> {
  switch (verb) {
    case "run":
      return caller.uat.run({
        taskId: requiredFlag(rest, "--task", "uat run"),
        traceId: flagValue(rest, "--trace"),
      });
    case "handoff":
      return caller.uat.handoff({
        taskId: requiredArg(rest, "uat handoff", "<id>"),
        traceId: flagValue(rest, "--trace"),
      });
    case "decision":
      return caller.uat.decision({
        taskId: requiredArg(rest, "uat decision", "<id>"),
        decision: parseDecision(requiredFlag(rest, "--decision", "uat decision")),
        feedback: flagValue(rest, "--feedback"),
        traceId: flagValue(rest, "--trace"),
      });
    default:
      throw new UnknownReviewVerbError("uat", verb);
  }
}

async function dispatchE2e(
  caller: ReviewStageCaller,
  verb: string,
  rest: readonly string[],
): Promise<ReviewStageResult> {
  switch (verb) {
    case "run":
      return caller.e2e.run({
        projectId: requiredFlag(rest, "--project", "e2e run"),
        runner: parseRunner(flagValue(rest, "--runner")),
        planOnly: rest.includes("--plan-only"),
        traceId: flagValue(rest, "--trace"),
      });
    case "report":
      return caller.e2e.report({
        runId: requiredArg(rest, "e2e report", "<run-id>"),
        traceId: flagValue(rest, "--trace"),
      });
    default:
      throw new UnknownReviewVerbError("e2e", verb);
  }
}

async function resolveCaller(opts: ReviewStageRunOptions): Promise<ReviewStageCaller> {
  if (opts.caller) return opts.caller;

  const env = opts.env ?? process.env;
  const baseUrl = env.FULCRUM_PUBLIC_API_URL ?? env.FULCRUM_SERVER_URL;
  if (!baseUrl) {
    throw new Error(
      "Review API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.",
    );
  }

  const fetchFn = opts.fetch ?? fetch;
  const apiRoot = ensureTrailingSlash(new URL("/api/v1/", ensureTrailingSlash(baseUrl)).toString());

  return {
    review: {
      list: (input) =>
        requestResult(fetchFn, `${apiRoot}reviews`, "GET", queryString({ status: input.status, reviewer: input.reviewerId }), input) as Promise<
          ReviewStageResult & { details: { items: ReviewListItem[] } }
        >,
      view: (input) =>
        requestResult(fetchFn, `${apiRoot}reviews/${encodeURIComponent(input.reviewId)}`, "GET", "", input),
      approve: (input) =>
        requestResult(fetchFn, `${apiRoot}reviews/${encodeURIComponent(input.reviewId)}/approve`, "POST", "", input),
      requestChanges: (input) =>
        requestResult(fetchFn, `${apiRoot}reviews/${encodeURIComponent(input.reviewId)}/request-changes`, "POST", "", input),
    },
    qa: {
      run: (input) => requestResult(fetchFn, `${apiRoot}qa/runs`, "POST", "", input),
      report: (input) =>
        requestResult(fetchFn, `${apiRoot}qa/runs/${encodeURIComponent(input.taskId)}/report`, "GET", "", input),
    },
    uat: {
      run: (input) => requestResult(fetchFn, `${apiRoot}uat/runs`, "POST", "", input),
      handoff: (input) =>
        requestResult(fetchFn, `${apiRoot}uat/${encodeURIComponent(input.taskId)}/handoff`, "POST", "", input),
      decision: (input) =>
        requestResult(fetchFn, `${apiRoot}uat/${encodeURIComponent(input.taskId)}/decision`, "POST", "", input),
    },
    e2e: {
      run: (input) => requestResult(fetchFn, `${apiRoot}e2e/runs`, "POST", "", input),
      report: (input) =>
        requestResult(fetchFn, `${apiRoot}e2e/runs/${encodeURIComponent(input.runId)}`, "GET", "", input),
    },
  };
}

async function requestResult(
  fetchFn: typeof fetch,
  url: string,
  method: "GET" | "POST",
  query: string,
  input: unknown,
): Promise<ReviewStageResult & { details: { items: ReviewListItem[] } }> {
  const response = await fetchFn(`${url}${query}`, {
    method,
    headers: method === "POST" ? { "content-type": "application/json" } : undefined,
    body: method === "POST" ? JSON.stringify(input) : undefined,
  });
  if (!response.ok) {
    throw new Error(`Review API request failed with ${response.status}.`);
  }
  return (await response.json()) as ReviewStageResult & { details: { items: ReviewListItem[] } };
}

function queryString(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params).filter(([, value]) => value !== undefined) as [string, string][];
  if (pairs.length === 0) return "";
  return `?${pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

function printOutput(
  result: ReviewStageResult,
  command: string,
  argv: readonly string[],
  print: (line: string) => void,
  env: ReviewStageApiEnvironment | undefined,
): void {
  // `--json` wraps this same `result` in the canonical `fulcrum.cli.v1`
  // envelope; plain output renders the same fields plus the DESIGN.md §4.10
  // trace header line: the result's trace id propagates into both surfaces.
  emitResult(
    {
      argv,
      command,
      result,
      trace: { trace_id: normalizeTraceId(result.traceId) },
      traceLine: true,
      env: env as NodeJS.ProcessEnv | undefined,
      renderHuman: (value) => {
        const items = value.details?.["items"];
        if (Array.isArray(items)) {
          if (items.length === 0) {
            print(`${value.domain} ${value.verb}: no items`);
          }
          for (const item of items as ReviewListItem[]) {
            print(`${item.reviewId}  ${item.status.padEnd(9)}  ${item.title}`);
          }
        } else {
          const subject = value.subjectId ? `${value.subjectId} ` : "";
          print(`${value.domain} ${value.verb}: ${subject}${value.status}`);
        }
        print(value.message);
      },
    },
    { print, printErr: print },
  );
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

function optionalReviewStatus(value: string | undefined): ReviewStatus | undefined {
  if (value === undefined) return undefined;
  return parseReviewStatus(value);
}

function parseReviewStatus(value: string): ReviewStatus {
  if (value === "open" || value === "approved" || value === "rejected") return value;
  throw new Error(`invalid --status '${value}' (expected open|approved|rejected)`);
}

function parseDecision(value: string): ReviewDecision {
  if (value === "approve" || value === "request_changes" || value === "reject") return value;
  throw new Error(`invalid --decision '${value}' (expected approve|request_changes|reject)`);
}

function parseRunner(value: string | undefined): E2eRunner | undefined {
  if (value === undefined) return undefined;
  if (value === "bun" || value === "playwright") return value;
  throw new Error(`invalid --runner '${value}' (expected bun|playwright)`);
}

function parseQaReportFormat(value: string | undefined): QaReportFormat | undefined {
  if (value === undefined) return undefined;
  if (value === "md" || value === "json") return value;
  throw new Error(`invalid --format '${value}' (expected md|json)`);
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
