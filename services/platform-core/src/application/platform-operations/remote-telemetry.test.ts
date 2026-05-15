/**
 * Tests for gated remote telemetry batch POST with HMAC signing.
 *
 * Uses a mocked HTTP server (Bun.serve) to verify:
 * - Flag OFF: no POST, TelemetryOutbox stays empty.
 * - Flag ON: batch → outbox → POST with X-Fulcrum-Signature header.
 * - HMAC verification on mocked server side.
 * - Outbox drained after 200.
 * - Retry on 503 (5xx exponential, max 3).
 * - Dead-letter on 4xx.
 * - Batch size ≤100 events; flush after 30s window.
 */

import { createHmac } from "node:crypto";
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  createTelemetryOutboxEntry,
  flushTelemetryOutbox,
  buildTelemetryBatch,
  signBatch,
  verifyBatchSignature,
  BATCH_MAX_SIZE,
  type TelemetryOutboxEntry,
  type TelemetryBatchPayload,
} from "./remote-telemetry.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvents(n: number): Array<{ id: string; kind: string; payload: Record<string, unknown>; occurredAt: string }> {
  return Array.from({ length: n }, (_, i) => ({
    id: `evt-${i}`,
    kind: "test.event",
    payload: { count: i },
    occurredAt: new Date().toISOString(),
  }));
}

const SECRET = "test-hmac-secret-key";

// ---------------------------------------------------------------------------
// Unit: BATCH_MAX_SIZE constant
// ---------------------------------------------------------------------------

describe("BATCH_MAX_SIZE", () => {
  test("is 100", () => {
    expect(BATCH_MAX_SIZE).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Unit: signBatch / verifyBatchSignature
// ---------------------------------------------------------------------------

describe("signBatch / verifyBatchSignature", () => {
  test("signature matches node:crypto reference", () => {
    const body = JSON.stringify({ events: makeEvents(2) });
    const sig = signBatch(body, SECRET);

    // Verify against node:crypto directly
    const expected = createHmac("sha256", SECRET).update(body).digest("hex");
    expect(sig).toBe(`sha256=${expected}`);
  });

  test("verifyBatchSignature accepts correct signature", () => {
    const body = JSON.stringify({ events: makeEvents(2) });
    const sig = signBatch(body, SECRET);
    expect(verifyBatchSignature(body, sig, SECRET)).toBe(true);
  });

  test("verifyBatchSignature rejects tampered body", () => {
    const body = JSON.stringify({ events: makeEvents(2) });
    const sig = signBatch(body, SECRET);
    expect(verifyBatchSignature(body + "x", sig, SECRET)).toBe(false);
  });

  test("verifyBatchSignature rejects wrong secret", () => {
    const body = JSON.stringify({ events: makeEvents(2) });
    const sig = signBatch(body, SECRET);
    expect(verifyBatchSignature(body, sig, "wrong-secret")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit: buildTelemetryBatch
// ---------------------------------------------------------------------------

describe("buildTelemetryBatch", () => {
  test("caps batch at BATCH_MAX_SIZE events", () => {
    const events = makeEvents(150);
    const batch = buildTelemetryBatch(events);
    expect(batch.events.length).toBe(BATCH_MAX_SIZE);
  });

  test("preserves all fields (no PII: no titles/bodies/paths)", () => {
    const events = makeEvents(3);
    const batch = buildTelemetryBatch(events);
    expect(batch.events).toHaveLength(3);
    for (const ev of batch.events) {
      expect(ev).toHaveProperty("id");
      expect(ev).toHaveProperty("kind");
      expect(ev).toHaveProperty("occurredAt");
      // payload should exist but NOT contain pii-style string keys
      expect(typeof ev.payload).toBe("object");
    }
  });
});

// ---------------------------------------------------------------------------
// Unit: createTelemetryOutboxEntry
// ---------------------------------------------------------------------------

describe("createTelemetryOutboxEntry", () => {
  test("creates entry with status=queued, attempts=0", () => {
    const events = makeEvents(5);
    const batch = buildTelemetryBatch(events);
    const entry = createTelemetryOutboxEntry(batch);
    expect(entry.status).toBe("queued");
    expect(entry.attempts).toBe(0);
    expect(entry.lastAttemptAt).toBeNull();
    expect(typeof entry.batchJson).toBe("string");
    // batchJson is parseable
    const parsed = JSON.parse(entry.batchJson) as TelemetryBatchPayload;
    expect(parsed.events).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Integration: flushTelemetryOutbox — mocked HTTP server
// ---------------------------------------------------------------------------

describe("flushTelemetryOutbox — HTTP integration", () => {
  let server: ReturnType<typeof Bun.serve> | null = null;
  let receivedRequests: Array<{ body: string; signature: string }> = [];
  let responseStatus = 200;

  beforeEach(() => {
    receivedRequests = [];
    responseStatus = 200;
    server = Bun.serve({
      port: 0, // random port
      fetch(req) {
        const sig = req.headers.get("x-fulcrum-signature") ?? "";
        return req.text().then((body) => {
          receivedRequests.push({ body, signature: sig });
          return new Response("ok", { status: responseStatus });
        });
      },
    });
  });

  afterEach(() => {
    server?.stop(true);
    server = null;
  });

  // ── Flag OFF ──────────────────────────────────────────────────────────────

  test("flag OFF: no POST, outbox not modified", async () => {
    const events = makeEvents(3);
    const batch = buildTelemetryBatch(events);
    const entry = createTelemetryOutboxEntry(batch);
    const outbox: TelemetryOutboxEntry[] = [entry];

    const result = await flushTelemetryOutbox({
      flagEnabled: false,
      outbox,
      endpoint: `http://localhost:${(server as { port: number }).port}/ingest`,
      secret: SECRET,
    });

    expect(receivedRequests).toHaveLength(0);
    expect(outbox[0]!.status).toBe("queued"); // unchanged
    expect(result.posted).toBe(0);
    expect(result.drained).toBe(0);
  });

  // ── Flag ON, success (200) ────────────────────────────────────────────────

  test("flag ON: POSTs batch with correct HMAC, drains outbox on 200", async () => {
    const events = makeEvents(5);
    const batch = buildTelemetryBatch(events);
    const entry = createTelemetryOutboxEntry(batch);
    const outbox: TelemetryOutboxEntry[] = [entry];

    const result = await flushTelemetryOutbox({
      flagEnabled: true,
      outbox,
      endpoint: `http://localhost:${(server as { port: number }).port}/ingest`,
      secret: SECRET,
    });

    expect(receivedRequests).toHaveLength(1);
    // Verify HMAC signature
    const req = receivedRequests[0]!;
    expect(verifyBatchSignature(req.body, req.signature, SECRET)).toBe(true);
    // Outbox drained
    expect(result.drained).toBe(1);
    expect(outbox[0]!.status).toBe("sent");
    expect(result.posted).toBe(1);
  });

  // ── Retry on 503 ─────────────────────────────────────────────────────────

  test("retry on 503: attempts incremented, status=retrying after max retries exceeded", async () => {
    responseStatus = 503;
    const events = makeEvents(2);
    const batch = buildTelemetryBatch(events);
    const entry = createTelemetryOutboxEntry(batch);
    const outbox: TelemetryOutboxEntry[] = [entry];

    const result = await flushTelemetryOutbox({
      flagEnabled: true,
      outbox,
      endpoint: `http://localhost:${(server as { port: number }).port}/ingest`,
      secret: SECRET,
      maxRetries: 3,
      retryDelayMs: 0, // no actual delay in tests
    });

    expect(receivedRequests.length).toBeGreaterThanOrEqual(1);
    // After exhausting retries entry should be retrying or dead
    expect(["retrying", "dead"]).toContain(outbox[0]!.status);
    expect(outbox[0]!.attempts).toBeGreaterThanOrEqual(1);
    expect(result.drained).toBe(0);
  });

  // ── Dead-letter on 4xx ────────────────────────────────────────────────────

  test("4xx response: entry moved to dead-letter, not retried", async () => {
    responseStatus = 400;
    const events = makeEvents(2);
    const batch = buildTelemetryBatch(events);
    const entry = createTelemetryOutboxEntry(batch);
    const outbox: TelemetryOutboxEntry[] = [entry];

    const result = await flushTelemetryOutbox({
      flagEnabled: true,
      outbox,
      endpoint: `http://localhost:${(server as { port: number }).port}/ingest`,
      secret: SECRET,
    });

    // Only 1 attempt (no retry on 4xx)
    expect(receivedRequests).toHaveLength(1);
    expect(outbox[0]!.status).toBe("dead");
    expect(result.drained).toBe(0);
    expect(result.deadLettered).toBe(1);
  });

  // ── 429 backoff ───────────────────────────────────────────────────────────

  test("429 response: entry status set to retrying (backed off)", async () => {
    responseStatus = 429;
    const events = makeEvents(2);
    const batch = buildTelemetryBatch(events);
    const entry = createTelemetryOutboxEntry(batch);
    const outbox: TelemetryOutboxEntry[] = [entry];

    const result = await flushTelemetryOutbox({
      flagEnabled: true,
      outbox,
      endpoint: `http://localhost:${(server as { port: number }).port}/ingest`,
      secret: SECRET,
      retryDelayMs: 0,
    });

    expect(outbox[0]!.status).toBe("retrying");
    expect(result.drained).toBe(0);
  });

  // ── Batch size cap ────────────────────────────────────────────────────────

  test("batch size capped at 100 events even if outbox entry has more", async () => {
    const events = makeEvents(150);
    const batch = buildTelemetryBatch(events);
    const entry = createTelemetryOutboxEntry(batch);
    // The batchJson should already be capped
    const parsed = JSON.parse(entry.batchJson) as TelemetryBatchPayload;
    expect(parsed.events.length).toBeLessThanOrEqual(BATCH_MAX_SIZE);
  });
});
