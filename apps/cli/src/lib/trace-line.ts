/**
 * CLI trace spine — the plain-text counterpart of the `fulcrum.cli.v1` JSON
 * envelope.
 *
 * `DESIGN.md` §4.10 makes the trace identity a *cross-surface* primitive: web
 * shows a copyable Trace-ID badge, the TUI status footer shows
 * `[trace:…] [run:…] [span:…]`, and the CLI must show the same identity in
 * **both** `--json` (the envelope) and plain output. This module owns the plain
 * rendering so a run a user starts on the CLI is followable in web / TUI by the
 * same id.
 *
 * Two surfaces, one identity:
 *  - `formatTraceLine` — the `DESIGN.md` §4.10 plain-text header line
 *    (`trace: 4f3a1c9e…  run: 01HXYZ…  project: fulcrum`), printed on stdout for
 *    run-bearing commands.
 *  - `formatErrorRecovery` — the `COPY.md` §3 / `CLI-TUI-UX.md` §5 error
 *    template (`[what failed]. [fix]. trace=<id>`), printed on stderr so a
 *    failure carries its recovery action *and* the trace reference.
 *
 * Both honour the `CLI-TUI-UX.md` §2.3 colour-disable conditions: dim ANSI is
 * applied only when stdout/stderr is a real TTY and no `--no-color` /
 * `NO_COLOR` / `FULCRUM_NO_COLOR` / `TERM=dumb` opt-out is set.
 */

import type { EnvelopeError, TraceIdentity } from "./envelope.ts";

/** ANSI dim/reset — applied only when colour is enabled. */
const DIM = "[2m";
const RESET = "[0m";

/** How many hex chars of `trace_id` / `run_id` the plain header line shows. */
const ID_PREFIX_LEN = 8;
/** Ellipsis appended after a truncated id — matches the `DESIGN.md` §4.10 badge. */
const ELLIPSIS = "…";

/** Inputs that decide whether ANSI colour is emitted. */
export interface ColorContext {
  /** Process env — read for `NO_COLOR`, `FULCRUM_NO_COLOR`, `TERM`. */
  env?: NodeJS.ProcessEnv;
  /** Raw argv — `--no-color` is honoured when present. */
  argv?: readonly string[];
  /**
   * Whether the destination stream is a TTY. Non-TTY always disables colour.
   * When omitted, falls back to `process.stdout.isTTY` so a piped or
   * redirected CLI invocation auto-disables colour without each caller
   * threading the flag.
   */
  isTty?: boolean;
}

/**
 * Resolve whether ANSI colour may be emitted, per `CLI-TUI-UX.md` §2.3.
 *
 * Colour is disabled when **any** of: the stream is not a TTY, `--no-color` is
 * passed, `NO_COLOR` is set (any value, including empty), `FULCRUM_NO_COLOR` is
 * set, or `TERM=dumb`.
 */
export function isColorEnabled(ctx: ColorContext = {}): boolean {
  const env = ctx.env ?? process.env;
  const argv = ctx.argv ?? [];
  // Non-TTY (pipe, file, CI) never gets colour — auto-detect when unspecified.
  const isTty = ctx.isTty ?? Boolean(process.stdout.isTTY);
  if (!isTty) return false;
  if (argv.includes("--no-color")) return false;
  // `NO_COLOR` / `FULCRUM_NO_COLOR` count when *present*, even if empty.
  if (env["NO_COLOR"] !== undefined) return false;
  if (env["FULCRUM_NO_COLOR"] !== undefined) return false;
  if (env["TERM"] === "dumb") return false;
  return true;
}

/** Apply dim ANSI only when colour is enabled — otherwise return the bare text. */
function dim(text: string, colour: boolean): string {
  return colour ? `${DIM}${text}${RESET}` : text;
}

/**
 * Truncate an id to its first {@link ID_PREFIX_LEN} chars + ellipsis, matching
 * the `DESIGN.md` §4.10 trace badge. Short ids (or already-short run ids) pass
 * through whole.
 */
function shortId(value: string): string {
  return value.length > ID_PREFIX_LEN ? `${value.slice(0, ID_PREFIX_LEN)}${ELLIPSIS}` : value;
}

/** Options for {@link formatTraceLine}. */
export interface TraceLineOptions extends ColorContext {
  /** Include `span:<id>` after `run:` — the TUI footer shows span; CLI may too. */
  withSpan?: boolean;
}

/**
 * Render the `DESIGN.md` §4.10 plain-text trace header line for one command
 * invocation:
 *
 *     trace: 4f3a1c9e…  run: 01HXYZ…  project: fulcrum
 *
 * `run` and `project` segments are omitted when the invocation has none (a
 * stateless command still prints `trace:` so the line is always present and
 * copy-pasteable). The whole string is plain ASCII apart from the `…` ellipsis,
 * so it survives copy-paste from any terminal. The same `trace_id` value is the
 * one the `fulcrum.cli.v1` envelope carries, keeping plain and `--json` output
 * correlatable.
 */
export function formatTraceLine(identity: TraceIdentity, options: TraceLineOptions = {}): string {
  const colour = isColorEnabled(options);
  const segments: string[] = [`${dim("trace:", colour)} ${shortId(identity.trace_id)}`];
  if (options.withSpan && identity.span_id) {
    segments.push(`${dim("span:", colour)} ${shortId(identity.span_id)}`);
  }
  if (identity.run_id) {
    segments.push(`${dim("run:", colour)} ${shortId(identity.run_id)}`);
  }
  if (identity.project_id) {
    segments.push(`${dim("project:", colour)} ${identity.project_id}`);
  }
  // Two spaces between segments — the DESIGN.md §4.10 header spacing.
  return segments.join("  ");
}

/** Options for {@link formatErrorRecovery}. */
export interface ErrorRecoveryOptions extends ColorContext {
  /** Trace id the failure belongs to — printed as `trace=<id>` for follow-up. */
  traceId: string;
}

/**
 * Render the `COPY.md` §3 / `CLI-TUI-UX.md` §5 plain-text error block:
 *
 *     <what failed>
 *       Fix: <exact next step>
 *       trace=<id>
 *
 * The pattern is `[what failed]. [why]. [fix]. trace=<id>` — the recovery action
 * and the trace reference are mandatory so the failure is followable in web /
 * TUI by the same id. `fix` and `doc` come straight from the envelope error
 * (`CLI-TUI-UX.md` §3.1); when the error names no `fix`, the `Fix:` line is
 * omitted but `trace=` is always present. The full (untruncated) trace id is
 * printed here — it is the value a user copies into `fulcrum trace show`.
 */
export function formatErrorRecovery(error: EnvelopeError, options: ErrorRecoveryOptions): string {
  const colour = isColorEnabled(options);
  const lines: string[] = [error.message];
  if (error.fix) {
    lines.push(`  ${dim("Fix:", colour)} ${error.fix}`);
  }
  if (error.doc) {
    lines.push(`  ${dim("Doc:", colour)} ${error.doc}`);
  }
  // `trace=<id>` is the COPY.md §3 template tail — always last, always present.
  lines.push(`  ${dim(`trace=${options.traceId}`, colour)}`);
  return lines.join("\n");
}
