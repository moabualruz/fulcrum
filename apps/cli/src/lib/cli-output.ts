/**
 * Shared `--json` output path for every CLI command.
 *
 * `emitResult` is the one helper a command calls with its underlying result
 * data. It decides between three output modes from the parsed argv:
 *
 *  - default `--json`     → the canonical `fulcrum.cli.v1` envelope (`CLI-TUI-UX.md` §3).
 *  - `--json --json-raw`  → the pre-envelope payload shape, kept for one release
 *                           so existing `--json` consumers do not break.
 *  - no `--json`          → caller-supplied human renderer over the SAME result data.
 *
 * `--jq <expr>` filters `.result` of the envelope through the `jq` binary
 * (`CLI-TUI-UX.md` §3: "`--jq <expr>` operates on the result of this envelope").
 *
 * Streaming commands use `emitStreamEnvelope` per item plus `emitStreamEnd` for
 * the JSONL end sentinel.
 */

import { spawnSync } from "node:child_process";

import {
  type CliEnvelope,
  type EnvelopeError,
  type EnvelopeInput,
  type EnvelopeNextAction,
  type EnvelopeStreamSentinel,
  createCliEnvelope,
  resolveTraceIdentity,
  serializeEnvelope,
  streamSentinel,
} from "./envelope.ts";
import { formatErrorRecovery, formatTraceLine } from "./trace-line.ts";

/** Output sink: defaults bind to the process streams. */
export interface OutputIo {
  print: (line: string) => void;
  printErr: (line: string) => void;
}

/** Parsed JSON-output intent for one command invocation. */
export interface JsonOutputMode {
  /** `--json` present. */
  json: boolean;
  /** `--json-raw` present: emit the pre-envelope shape (one-release compat). */
  raw: boolean;
  /** `--jq <expr>` value, applied to `.result` of the envelope. */
  jq: string | undefined;
}

/** Derive the JSON-output mode from raw argv. `--json-raw` implies JSON output. */
export function parseJsonOutputMode(argv: readonly string[]): JsonOutputMode {
  const jqIndex = argv.indexOf("--jq");
  const jqValue = jqIndex >= 0 ? argv[jqIndex + 1] : undefined;
  const raw = argv.includes("--json-raw");
  return {
    // `--json-raw` is a JSON-output mode too: it just selects the legacy shape.
    json: argv.includes("--json") || raw,
    raw,
    jq: jqValue && !jqValue.startsWith("-") ? jqValue : undefined,
  };
}

/** Everything `emitResult` needs to render one command outcome. */
export interface EmitResultInput<TResult> extends EnvelopeInput<TResult> {
  /** Raw argv for the command: mode is parsed from it. */
  argv: readonly string[];
  /** Human renderer invoked when `--json` is absent. Receives the same result. */
  renderHuman: (result: TResult) => void;
  /**
   * When set, plain (non-`--json`) output prints the `DESIGN.md` §4.10 trace
   * header line after `renderHuman`: the cross-surface trace spine. Pass
   * `true` for the default line, or an object to also show the `span:` segment.
   * The line uses the SAME resolved trace identity the `--json` envelope
   * carries, so plain and JSON output for one invocation stay correlatable.
   */
  traceLine?: boolean | { withSpan?: boolean };
  /** Process env: drives `CLI-TUI-UX.md` §2.3 colour-disable detection. */
  env?: NodeJS.ProcessEnv;
}

/** Resolve whether the trace line is requested and with which options. */
function traceLineOptions(
  flag: boolean | { withSpan?: boolean } | undefined,
): { withSpan: boolean } | undefined {
  if (flag === undefined) return { withSpan: false };
  if (!flag) return undefined;
  return { withSpan: flag === true ? false : Boolean(flag.withSpan) };
}

/**
 * Print the `DESIGN.md` §4.10 plain-text trace header line for one invocation.
 * Shared by `emitResult` / `emitStreamEnvelope` so plain output always carries
 * the same trace identity as the `--json` envelope.
 */
function printTraceLine<TResult>(
  input: EmitResultInput<TResult>,
  io: OutputIo,
  lineOpts: { withSpan: boolean },
): void {
  // Resolve identity exactly as `wrapEnvelope` does: same id in both surfaces.
  const identity = resolveTraceIdentity(input.trace, input.env);
  io.print(
    formatTraceLine(identity, {
      withSpan: lineOpts.withSpan,
      env: input.env,
      argv: input.argv,
    }),
  );
}

/**
 * Filter a JSON value through the `jq` binary. Returns the raw `jq` stdout
 * (already newline-delimited). Throws a coded error if `jq` is unavailable or
 * the expression fails: never silently drops output.
 */
export function applyJqFilter(expression: string, value: unknown): string {
  const probe = spawnSync("jq", ["--version"], { stdio: "ignore" });
  if (probe.error || probe.status !== 0) {
    throw new JqUnavailableError();
  }
  const filtered = spawnSync("jq", ["-c", expression], {
    input: JSON.stringify(value),
    encoding: "utf8",
  });
  if (filtered.status !== 0) {
    throw new JqExpressionError(expression, (filtered.stderr ?? "").trim());
  }
  return (filtered.stdout ?? "").replace(/\n+$/, "");
}

/** Thrown when `--jq` is requested but the `jq` binary is not installed. */
export class JqUnavailableError extends Error {
  readonly code = "FUL_CLI_JQ_UNAVAILABLE";
  constructor() {
    super("`--jq` requires the `jq` binary. Install jq, or drop --jq and parse .result yourself.");
    this.name = "JqUnavailableError";
  }
}

/** Thrown when a `--jq` expression fails to evaluate against `.result`. */
export class JqExpressionError extends Error {
  readonly code = "FUL_CLI_JQ_INVALID";
  constructor(expression: string, detail: string) {
    super(`\`--jq\` expression failed: ${expression}${detail ? `: ${detail}` : ""}`);
    this.name = "JqExpressionError";
  }
}

/**
 * Emit one command outcome. The single shared `--json` exit point: it wraps the
 * result in the canonical envelope, applies `--jq` to `.result`, honours the
 * `--json-raw` compatibility shape, or delegates to the human renderer.
 */
export function emitResult<TResult>(input: EmitResultInput<TResult>, io: OutputIo): void {
  const mode = parseJsonOutputMode(input.argv);
  if (!mode.json) {
    const lineOpts = traceLineOptions(input.traceLine);
    if (lineOpts) printTraceLine(input, io, lineOpts);
    input.renderHuman(input.result);
    return;
  }
  if (mode.raw) {
    io.print(JSON.stringify(input.result));
    return;
  }
  const envelope = createCliEnvelope({
    command: input.command,
    args: input.args,
    result: input.result,
    errors: input.errors,
    next_actions: input.next_actions,
    trace: input.trace,
    startedAt: input.startedAt,
    now: input.now,
  });
  if (mode.jq) {
    io.print(applyJqFilter(mode.jq, envelope.result));
    return;
  }
  io.print(serializeEnvelope(envelope));
}

/**
 * Emit one envelope line of a JSONL stream. Each streamed item is a full
 * canonical envelope; `--jq` filters its `.result`.
 */
export function emitStreamEnvelope<TResult>(input: EmitResultInput<TResult>, io: OutputIo): void {
  const mode = parseJsonOutputMode(input.argv);
  if (!mode.json) {
    input.renderHuman(input.result);
    return;
  }
  // Streaming JSONL never interleaves a plain trace line into the stream: the
  // trace line for a streaming run is printed once by `emitStreamTraceLine`.
  if (mode.raw) {
    io.print(JSON.stringify(input.result));
    return;
  }
  const envelope = createCliEnvelope({
    command: input.command,
    args: input.args,
    result: input.result,
    errors: input.errors,
    next_actions: input.next_actions,
    trace: input.trace,
    startedAt: input.startedAt,
    now: input.now,
  });
  if (mode.jq) {
    io.print(applyJqFilter(mode.jq, envelope.result));
    return;
  }
  io.print(serializeEnvelope(envelope));
}

/** Emit the JSONL end-of-stream sentinel. No-op when `--json` is absent. */
export function emitStreamEnd(argv: readonly string[], traceId: string, io: OutputIo): void {
  const mode = parseJsonOutputMode(argv);
  if (!mode.json || mode.raw) return;
  io.print(serializeEnvelope(streamSentinel(traceId)));
}

/**
 * Print the plain-text trace header line for a streaming run-bearing command.
 *
 * Streaming JSONL must not interleave a plain line, so a `runs feed --watch`
 * style command calls this once *before* it starts streaming when `--json` is
 * absent: the same `DESIGN.md` §4.10 line a non-streaming command prints.
 */
export function emitStreamTraceLine(
  input: {
    argv: readonly string[];
    trace?: EnvelopeInput<null>["trace"];
    env?: NodeJS.ProcessEnv;
    withSpan?: boolean;
  },
  io: OutputIo,
): void {
  const mode = parseJsonOutputMode(input.argv);
  if (mode.json) return;
  const identity = resolveTraceIdentity(input.trace, input.env);
  io.print(
    formatTraceLine(identity, {
      withSpan: Boolean(input.withSpan),
      env: input.env,
      argv: input.argv,
    }),
  );
}

/**
 * Emit a failed command outcome.
 *
 * Under `--json` the failure stays inside the canonical envelope (`result`
 * null, the coded error in the always-array `errors` field). Under `--json-raw`
 * the legacy `{error:{code,message}}` shape is kept for one release. In plain
 * mode it prints the `COPY.md` §3 / `CLI-TUI-UX.md` §5 recovery block: the
 * error message, the `Fix:` action, and `trace=<id>`: to stderr, so a CLI
 * failure is followable in web / TUI by the same trace id. The `renderHuman`
 * callback is the fallback for commands that have no structured recovery copy.
 */
export function emitErrorResult(
  input: {
    argv: readonly string[];
    command: string;
    args?: Record<string, unknown>;
    error: EnvelopeError;
    next_actions?: EnvelopeNextAction[];
    trace?: EnvelopeInput<null>["trace"];
    env?: NodeJS.ProcessEnv;
    renderHuman: () => void;
    /**
     * When `true` (the default), plain-mode failures print the structured
     * `COPY.md` §3 recovery block instead of `renderHuman`. Pass `false` only
     * for commands that own a bespoke plain error renderer.
     */
    recoveryCopy?: boolean;
  },
  io: OutputIo,
): void {
  const mode = parseJsonOutputMode(input.argv);
  if (!mode.json) {
    const useRecoveryCopy = input.recoveryCopy ?? true;
    if (useRecoveryCopy) {
      // The trace id printed for follow-up is the same one the envelope carries.
      const identity = resolveTraceIdentity(input.trace, input.env);
      io.printErr(
        formatErrorRecovery(input.error, {
          traceId: input.error.trace_id ?? identity.trace_id,
          env: input.env,
          argv: input.argv,
        }),
      );
      return;
    }
    input.renderHuman();
    return;
  }
  if (mode.raw) {
    io.print(JSON.stringify({ error: { code: input.error.code, message: input.error.message } }));
    return;
  }
  const envelope = createCliEnvelope({
    command: input.command,
    args: input.args,
    result: null,
    errors: [input.error],
    next_actions: input.next_actions,
    trace: input.trace,
  });
  io.print(serializeEnvelope(envelope));
}

export type { CliEnvelope, EnvelopeStreamSentinel };
