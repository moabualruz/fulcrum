/**
 * Canonical `fulcrum.cli.v1` JSON envelope.
 *
 * Every `--json` CLI command wraps its payload in this envelope so an agent can
 * parse `trace_id` / `span_id` / `run_id` uniformly across the whole surface.
 *
 * The field set is the load-bearing contract defined in `CLI-TUI-UX.md` §3 -
 * exactly twelve keys, no more, no fewer. `errors` and `next_actions` are
 * always arrays, never null. The spec uses `timestamp` (not the `DESIGN.md`
 * §4.10 `ts` shorthand); the conflict is resolved in favour of `timestamp` by
 * `prd-cross-design-reference-manifest`.
 */

import { randomBytes } from "node:crypto";

/** The locked envelope schema identifier (`CLI-TUI-UX.md` §3). */
export const ENVELOPE_SCHEMA = "fulcrum.cli.v1" as const;

/** Error sub-envelope (`CLI-TUI-UX.md` §3.1). `code` is namespaced `FUL_<DOMAIN>_<SPECIFIC>`. */
export interface EnvelopeError {
  code: string;
  message: string;
  fix?: string;
  doc?: string;
  trace_id?: string;
  context?: Record<string, unknown>;
}

/** Follow-on action suggestion surfaced in the envelope (`CLI-TUI-UX.md` §3). */
export interface EnvelopeNextAction {
  label: string;
  command: string;
}

/**
 * The canonical `fulcrum.cli.v1` envelope. Exactly the `CLI-TUI-UX.md` §3 keys:
 * `schema`, `trace_id`, `span_id`, `run_id`, `project_id`, `command`, `args`,
 * `result`, `errors`, `next_actions`, `duration_ms`, `timestamp`.
 */
export interface CliEnvelope<TResult = unknown> {
  schema: typeof ENVELOPE_SCHEMA;
  trace_id: string;
  span_id: string;
  run_id: string | null;
  project_id: string | null;
  command: string;
  args: Record<string, unknown>;
  result: TResult;
  errors: EnvelopeError[];
  next_actions: EnvelopeNextAction[];
  duration_ms: number;
  timestamp: string;
}

/**
 * End-of-stream sentinel for JSONL streaming commands (`CLI-TUI-UX.md` §3):
 * `{"schema":"fulcrum.cli.v1","result":null,"end":true,"trace_id":"…"}`.
 */
export interface EnvelopeStreamSentinel {
  schema: typeof ENVELOPE_SCHEMA;
  result: null;
  end: true;
  trace_id: string;
}

/** Trace identity carried by every envelope in a single command invocation. */
export interface TraceIdentity {
  trace_id: string;
  span_id: string;
  run_id: string | null;
  project_id: string | null;
}

/** Inputs that fully describe one envelope payload. */
export interface EnvelopeInput<TResult> {
  command: string;
  args?: Record<string, unknown>;
  result: TResult;
  errors?: EnvelopeError[];
  next_actions?: EnvelopeNextAction[];
  trace?: Partial<TraceIdentity>;
  /** Command start time (ms epoch); `duration_ms` derives from `Date.now()`. */
  startedAt?: number;
  /** Override the wall clock: test seam only. */
  now?: () => number;
}

const CROCKFORD32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function hexId(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

/** 32-char lowercase hex trace id. Honours `FULCRUM_TRACE_ID` when set. */
export function newTraceId(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env["FULCRUM_TRACE_ID"];
  if (fromEnv && /^[0-9a-f]{32}$/i.test(fromEnv)) return fromEnv.toLowerCase();
  return hexId(16);
}

/** 16-char lowercase hex span id: fresh per command invocation. */
export function newSpanId(): string {
  return hexId(8);
}

/** 26-char Crockford-base32 ULID-shaped run id. */
export function newRunId(now: () => number = Date.now): string {
  let time = now();
  const timeChars: string[] = [];
  for (let i = 9; i >= 0; i -= 1) {
    timeChars[i] = CROCKFORD32[time % 32]!;
    time = Math.floor(time / 32);
  }
  const random = randomBytes(16);
  let randomPart = "";
  for (let i = 0; i < 16; i += 1) {
    randomPart += CROCKFORD32[random[i]! % 32];
  }
  return (timeChars.join("") + randomPart).slice(0, 26);
}

/**
 * Resolve the trace identity for a command invocation. `FULCRUM_TRACE_ID`
 * propagates the trace id across surfaces; the span id is always fresh.
 */
export function resolveTraceIdentity(
  partial: Partial<TraceIdentity> = {},
  env: NodeJS.ProcessEnv = process.env,
): TraceIdentity {
  return {
    trace_id: partial.trace_id ?? newTraceId(env),
    span_id: partial.span_id ?? newSpanId(),
    run_id: partial.run_id ?? null,
    project_id: partial.project_id ?? env["FULCRUM_PROJECT_ID"] ?? null,
  };
}

/**
 * Wrap a command result in the canonical `fulcrum.cli.v1` envelope. The shared
 * helper every `--json` command must route through.
 */
export function wrapEnvelope<TResult>(input: EnvelopeInput<TResult>): CliEnvelope<TResult> {
  const now = input.now ?? Date.now;
  const identity = resolveTraceIdentity(input.trace);
  const startedAt = input.startedAt ?? now();
  return {
    schema: ENVELOPE_SCHEMA,
    trace_id: identity.trace_id,
    span_id: identity.span_id,
    run_id: identity.run_id,
    project_id: identity.project_id,
    command: input.command,
    args: input.args ?? {},
    result: input.result,
    errors: input.errors ?? [],
    next_actions: input.next_actions ?? [],
    duration_ms: Math.max(0, now() - startedAt),
    timestamp: new Date(now()).toISOString(),
  };
}

/** Compatibility name locked by CLI parity PRDs; delegates to the canonical wrapper. */
export function createCliEnvelope<TResult>(input: EnvelopeInput<TResult>): CliEnvelope<TResult> {
  return wrapEnvelope(input);
}

/** Build the JSONL end-of-stream sentinel for a streaming command. */
export function streamSentinel(traceId: string): EnvelopeStreamSentinel {
  return { schema: ENVELOPE_SCHEMA, result: null, end: true, trace_id: traceId };
}

/** Serialise an envelope (or sentinel) to a single JSON line for stdout. */
export function serializeEnvelope(envelope: CliEnvelope | EnvelopeStreamSentinel): string {
  return JSON.stringify(envelope);
}

/** True when the canonical 12-key envelope shape is intact and invariants hold. */
export function isCanonicalEnvelope(value: unknown): value is CliEnvelope {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [
    "args",
    "command",
    "duration_ms",
    "errors",
    "next_actions",
    "project_id",
    "result",
    "run_id",
    "schema",
    "span_id",
    "timestamp",
    "trace_id",
  ];
  if (keys.length !== expected.length) return false;
  if (!keys.every((key, index) => key === expected[index])) return false;
  return (
    record["schema"] === ENVELOPE_SCHEMA &&
    typeof record["trace_id"] === "string" &&
    typeof record["span_id"] === "string" &&
    typeof record["command"] === "string" &&
    typeof record["duration_ms"] === "number" &&
    typeof record["timestamp"] === "string" &&
    Array.isArray(record["errors"]) &&
    Array.isArray(record["next_actions"])
  );
}
