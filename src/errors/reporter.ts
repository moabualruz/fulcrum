/**
 * reporter.ts — gated remote error reporting.
 *
 * Gated behind FULCRUM_FEATURES=error-reporting-remote (C1: build always, gate ON behind flag).
 * Sends crash entries from ErrorLog to user-configured endpoint via graphile-worker job errors:report.
 *
 * Key guarantees:
 *   - Stack traces scrubbed of absolute paths (Unix /Users, /home, Windows C:\Users).
 *   - HMAC-SHA256 signing with X-Fulcrum-Signature header.
 *   - No PII (email, tokens, file contents) in payload.
 *   - 4xx response → dead-letter flag on job result.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

// ─── types ─────────────────────────────────────────────────────────────────────

/** Subset of ErrorLog entity fields needed for reporting. */
export interface ErrorReportEntry {
  id: string;
  errorMessage: string;
  stackTrace?: string | null;
  occurredAt: Date;
  os?: string | null;
  arch?: string | null;
  bunVersion?: string | null;
  fulcrumVersion?: string | null;
  /** Free-form context — PII fields will be stripped. */
  context?: Record<string, unknown>;
}

/** Shape of the outbound POST body. */
export interface ErrorReportPayload {
  id: string;
  error_message: string;
  stack_trace?: string;
  occurred_at: string;
  os?: string;
  arch?: string;
  bun_version?: string;
  fulcrum_version?: string;
}

/** Job payload enqueued as errors:report. */
export interface ErrorReportJob {
  payload: ErrorReportPayload;
  endpoint: string;
  signature: string;
  headers: {
    "X-Fulcrum-Signature": string;
  };
}

/** Options for enqueueErrorReport. */
export interface EnqueueErrorReportOptions {
  featureEnabled: boolean;
  endpoint: string | undefined;
  signingSecret: string;
  /** Injectable job enqueuer — production wires graphile-worker addJob. */
  enqueueJob: (jobName: string, payload: ErrorReportJob) => Promise<void>;
}

// ─── path scrubbing ────────────────────────────────────────────────────────────

/**
 * PII-safe set of keys — if context has any of these, omit from payload.
 * Lowercase check so "Email", "EMAIL" etc. are caught.
 */
const PII_KEYS = new Set(["email", "token", "secret", "password", "apikey", "api_key"]);

/** Regex patterns for absolute paths. Order: Unix /Users, Unix /home, Windows. */
const PATH_PATTERNS: Array<[RegExp, string]> = [
  // /Users/<name>/ → <homedir>/
  [/\/Users\/[^/\s\\]+\//g, "<homedir>/"],
  // /home/<name>/ → <homedir>/
  [/\/home\/[^/\s\\]+\//g, "<homedir>/"],
  // C:\Users\<name>\ → <homedir>\
  [/[A-Za-z]:\\Users\\[^\\\s]+\\/g, "<homedir>\\"],
];

/**
 * scrubPaths — replace absolute home-directory paths with <homedir>/<rest>.
 * Works for Unix (/Users/<name>/, /home/<name>/) and Windows (C:\Users\<name>\).
 */
export function scrubPaths(text: string): string {
  let result = text;
  for (const [pattern, replacement] of PATH_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ─── payload builder ───────────────────────────────────────────────────────────

/**
 * buildReportPayload — constructs a PII-free, path-scrubbed payload from an ErrorReportEntry.
 * Does NOT include user_id, org_id, or any context values matching PII key names.
 */
export function buildReportPayload(entry: ErrorReportEntry): ErrorReportPayload {
  const payload: ErrorReportPayload = {
    id: entry.id,
    error_message: entry.errorMessage,
    occurred_at: entry.occurredAt.toISOString(),
  };

  if (entry.stackTrace) {
    payload.stack_trace = scrubPaths(entry.stackTrace);
  }
  if (entry.os) payload.os = entry.os;
  if (entry.arch) payload.arch = entry.arch;
  if (entry.bunVersion) payload.bun_version = entry.bunVersion;
  if (entry.fulcrumVersion) payload.fulcrum_version = entry.fulcrumVersion;

  // context: include only safe keys (non-PII), and scrub path strings within values
  // Currently excluded entirely to ensure no PII leaks via context fields.
  // Future: allow-list specific safe context keys explicitly.

  return payload;
}

// ─── HMAC signing ─────────────────────────────────────────────────────────────

/**
 * signPayload — HMAC-SHA256 sign the JSON-serialised payload.
 * Returns lowercase hex digest.
 */
export function signPayload(payload: unknown, secret: string): string {
  const body = JSON.stringify(payload);
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * verifySignature — constant-time check of HMAC-SHA256 signature against body string.
 */
export function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

// ─── job enqueuer ──────────────────────────────────────────────────────────────

/**
 * enqueueErrorReport — enqueues an errors:report graphile-worker job.
 *
 * Guard conditions:
 *   - featureEnabled = false → no-op.
 *   - endpoint missing → no-op (log warning but don't crash).
 *
 * The job worker (not implemented here) is responsible for:
 *   - POSTing to endpoint with X-Fulcrum-Signature header.
 *   - On 4xx: marking job as dead-letter.
 */
export async function enqueueErrorReport(
  entry: ErrorReportEntry,
  opts: EnqueueErrorReportOptions,
): Promise<void> {
  if (!opts.featureEnabled) return;
  if (!opts.endpoint) return;

  const payload = buildReportPayload(entry);
  const signature = signPayload(payload, opts.signingSecret);

  const job: ErrorReportJob = {
    payload,
    endpoint: opts.endpoint,
    signature,
    headers: {
      "X-Fulcrum-Signature": signature,
    },
  };

  await opts.enqueueJob("errors:report", job);
}

// ─── convenience: read options from env ────────────────────────────────────────

/**
 * errorReportingOptionsFromEnv — reads FULCRUM_FEATURES and FULCRUM_ERROR_REPORT_* from env.
 * Useful for production wiring in crashlog.ts / server bootstrap.
 */
export function errorReportingOptionsFromEnv(): Pick<
  EnqueueErrorReportOptions,
  "featureEnabled" | "endpoint" | "signingSecret"
> {
  const featureEnabled = (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((f) => f.trim())
    .includes("error-reporting-remote");

  return {
    featureEnabled,
    endpoint: process.env["FULCRUM_ERROR_REPORT_ENDPOINT"] || undefined,
    signingSecret: process.env["FULCRUM_ERROR_REPORT_SECRET"] ?? "",
  };
}
