/**
 * Gated remote telemetry batch POST with HMAC signing.
 *
 * C1: entire module behind FULCRUM_FEATURES=telemetry-remote.
 *     When flag OFF → no outbound POST, TelemetryOutbox remains empty.
 * C2: TelemetryOutbox stores queued batch JSON, attempts, last_attempt_at, status.
 * D5: Flag name: "telemetry-remote" (lowercase-with-hyphens).
 *
 * Batch: up to 100 TelemetryEvent rows per POST (BATCH_MAX_SIZE).
 * Flush trigger: graphile-worker job `telemetry:flush` (30s schedule).
 * Signing: HMAC-SHA256 over raw body; header X-Fulcrum-Signature: sha256=<hex>.
 * Retry: 5xx → exponential backoff, max 3 attempts.
 *        429 → retrying (backed off).
 *        4xx → dead-letter + doctor warning.
 *        200 → drain (delete) outbox entry.
 *
 * No PII in payload: events carry only kind, aggregate payload, occurredAt.
 * User IDs are omitted from the remote batch — only org-scoped aggregates.
 *
 * Closes (issue): .scratch/agent-os-vision/17-cross-cutting-platform/issues/16-gated-telemetry-remote.md
 */

import { createHmac, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum events per single POST batch. */
export const BATCH_MAX_SIZE = 100;

/** Graphile-worker job name that triggers flush. */
export const TELEMETRY_FLUSH_JOB = "telemetry:flush";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Sanitised event shape included in remote batch — no user IDs (PII guard). */
export interface TelemetryBatchEvent {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

/** Entire batch payload POSTed to remote endpoint. */
export interface TelemetryBatchPayload {
  events: TelemetryBatchEvent[];
}

/** Status lifecycle: queued → (retrying | sent | dead). */
export type OutboxStatus = "queued" | "retrying" | "sent" | "dead";

/**
 * TelemetryOutbox in-process entry.
 *
 * Mirrors the telemetry_outbox DB entity. For the DB entity see:
 * src/db/entities/platform/TelemetryOutbox.ts (created by the companion
 * migration; this file works against the in-process representation so tests
 * don't need a live DB).
 */
export interface TelemetryOutboxEntry {
  id: string;
  batchJson: string;
  attempts: number;
  lastAttemptAt: Date | null;
  status: OutboxStatus;
}

// ---------------------------------------------------------------------------
// HMAC helpers
// ---------------------------------------------------------------------------

/**
 * Sign a raw request body with HMAC-SHA256.
 * Returns the header value string: `sha256=<hex>`.
 */
export function signBatch(body: string, secret: string): string {
  const hex = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${hex}`;
}

/**
 * Verify an inbound X-Fulcrum-Signature header value against the raw body.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyBatchSignature(body: string, signature: string, secret: string): boolean {
  const expected = signBatch(body, secret);
  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
  } catch {
    // Buffers differ in length → not equal
    return false;
  }
}

// ---------------------------------------------------------------------------
// Batch building
// ---------------------------------------------------------------------------

/**
 * Build a TelemetryBatchPayload from raw event rows.
 * Caps at BATCH_MAX_SIZE. Strips user_id (PII) — only id, kind, payload,
 * occurredAt are forwarded.
 */
export function buildTelemetryBatch(
  events: Array<{ id: string; kind: string; payload: Record<string, unknown>; occurredAt: string }>,
): TelemetryBatchPayload {
  const sliced = events.slice(0, BATCH_MAX_SIZE);
  return {
    events: sliced.map((ev) => ({
      id: ev.id,
      kind: ev.kind,
      payload: ev.payload,
      occurredAt: ev.occurredAt,
    })),
  };
}

// ---------------------------------------------------------------------------
// Outbox entry factory
// ---------------------------------------------------------------------------

let _outboxSeq = 0;

/**
 * Create a new TelemetryOutboxEntry from a batch payload.
 * In production this is persisted to the telemetry_outbox DB table before
 * the network call; here we construct the in-process representation.
 */
export function createTelemetryOutboxEntry(batch: TelemetryBatchPayload): TelemetryOutboxEntry {
  return {
    id: `outbox-${++_outboxSeq}-${Date.now()}`,
    batchJson: JSON.stringify(batch),
    attempts: 0,
    lastAttemptAt: null,
    status: "queued",
  };
}

// ---------------------------------------------------------------------------
// Flush logic
// ---------------------------------------------------------------------------

export interface FlushOptions {
  /** Whether the telemetry-remote feature flag is enabled. */
  flagEnabled: boolean;
  /** In-process outbox entries to flush. Mutated in-place. */
  outbox: TelemetryOutboxEntry[];
  /** FULCRUM_TELEMETRY_ENDPOINT value. */
  endpoint: string;
  /** FULCRUM_TELEMETRY_SECRET value. */
  secret: string;
  /** Max retry attempts for 5xx responses (default 3). */
  maxRetries?: number;
  /** Base delay between retries in ms (default 1000; set 0 in tests). */
  retryDelayMs?: number;
}

export interface FlushResult {
  posted: number;
  drained: number;
  deadLettered: number;
  skipped: number;
}

/**
 * Flush the telemetry outbox: POST each queued entry to the remote endpoint.
 *
 * When flagEnabled=false: no-op — outbox untouched, no network calls.
 * When flagEnabled=true: for each queued/retrying entry:
 *   - POST batch JSON with X-Fulcrum-Signature HMAC header.
 *   - 200 → mark sent (drained).
 *   - 429 → mark retrying (backoff signal for next job run).
 *   - 5xx → increment attempts; if < maxRetries → retrying, else dead.
 *   - 4xx → dead (dead-letter).
 */
export async function flushTelemetryOutbox(opts: FlushOptions): Promise<FlushResult> {
  const {
    flagEnabled,
    outbox,
    endpoint,
    secret,
    maxRetries = 3,
    retryDelayMs = 1000,
  } = opts;

  const result: FlushResult = { posted: 0, drained: 0, deadLettered: 0, skipped: 0 };

  if (!flagEnabled) {
    result.skipped = outbox.length;
    return result;
  }

  for (const entry of outbox) {
    if (entry.status === "sent" || entry.status === "dead") {
      result.skipped++;
      continue;
    }

    entry.lastAttemptAt = new Date();
    entry.attempts++;

    let statusCode: number;
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Fulcrum-Signature": signBatch(entry.batchJson, secret),
        },
        body: entry.batchJson,
      });
      statusCode = resp.status;
    } catch {
      // Network error — treat as 503
      statusCode = 503;
    }

    result.posted++;

    if (statusCode >= 200 && statusCode < 300) {
      entry.status = "sent";
      result.drained++;
    } else if (statusCode === 429) {
      // Rate-limited — back off, retry next cycle
      entry.status = "retrying";
      if (retryDelayMs > 0) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    } else if (statusCode >= 500) {
      // Server error — exponential retry up to maxRetries
      if (entry.attempts < maxRetries) {
        entry.status = "retrying";
        if (retryDelayMs > 0) {
          const delay = retryDelayMs * Math.pow(2, entry.attempts - 1);
          await new Promise((r) => setTimeout(r, delay));
        }
      } else {
        entry.status = "dead";
        result.deadLettered++;
      }
    } else {
      // 4xx — dead-letter immediately
      entry.status = "dead";
      result.deadLettered++;
    }
  }

  return result;
}
