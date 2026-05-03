// @ts-nocheck
/**
 * reporter.test.ts — Vitest for gated remote error reporting.
 *
 * Tests:
 *   1. Flag OFF → no POST.
 *   2. Flag ON → errors:report job enqueued with scrubbed payload + HMAC header.
 *   3. Path scrubbing: Unix absolute paths, Windows paths.
 *   4. No PII (email, secrets) in payload.
 *   5. HMAC verification.
 *   6. 4xx response → dead-letter flag set on job result.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  scrubPaths,
  buildReportPayload,
  signPayload,
  verifySignature,
  enqueueErrorReport,
  type ErrorReportEntry,
  type EnqueueErrorReportOptions,
} from "./reporter.ts";

// ─── path scrubbing ────────────────────────────────────────────────────────────

describe("scrubPaths", () => {
  it("replaces Unix /Users/<name>/... with <homedir>/...", () => {
    const result = scrubPaths("/Users/mkh/projects/fulcrum/src/index.ts");
    expect(result).toBe("<homedir>/projects/fulcrum/src/index.ts");
  });

  it("replaces /home/<name>/... with <homedir>/...", () => {
    const result = scrubPaths("/home/alice/workspace/app.ts");
    expect(result).toBe("<homedir>/workspace/app.ts");
  });

  it("replaces Windows C:\\Users\\<name>\\... with <homedir>\\...", () => {
    const result = scrubPaths("C:\\Users\\alice\\Projects\\app.ts");
    expect(result).toBe("<homedir>\\Projects\\app.ts");
  });

  it("replaces multiple occurrences in a stack trace", () => {
    const stack = [
      "Error: boom",
      "    at foo (/Users/mkh/fulcrum/src/a.ts:1:1)",
      "    at bar (/home/bob/fulcrum/src/b.ts:2:2)",
    ].join("\n");
    const result = scrubPaths(stack);
    expect(result).toContain("<homedir>/fulcrum/src/a.ts:1:1");
    expect(result).toContain("<homedir>/fulcrum/src/b.ts:2:2");
    expect(result).not.toContain("/Users/mkh");
    expect(result).not.toContain("/home/bob");
  });

  it("leaves non-path strings unchanged", () => {
    const s = "Error: something went wrong at line 42";
    expect(scrubPaths(s)).toBe(s);
  });
});

// ─── buildReportPayload ────────────────────────────────────────────────────────

describe("buildReportPayload", () => {
  it("includes scrubbed stack trace", () => {
    const entry: ErrorReportEntry = {
      id: "test-id",
      errorMessage: "boom",
      stackTrace: "/Users/mkh/fulcrum/src/index.ts:10:5",
      occurredAt: new Date("2025-01-01T00:00:00Z"),
      os: "darwin",
      arch: "arm64",
      bunVersion: "1.0.0",
      fulcrumVersion: "0.1.0",
    };
    const payload = buildReportPayload(entry);
    expect(payload.stack_trace).toBe("<homedir>/fulcrum/src/index.ts:10:5");
    expect(payload.error_message).toBe("boom");
  });

  it("excludes PII fields (email, secret values)", () => {
    const entry: ErrorReportEntry = {
      id: "x",
      errorMessage: "fail",
      occurredAt: new Date(),
      // intentional: email-like string in context — should not appear
      context: { email: "user@example.com", token: "secret-token-abc" },
    };
    const payload = buildReportPayload(entry);
    const json = JSON.stringify(payload);
    expect(json).not.toContain("user@example.com");
    expect(json).not.toContain("secret-token-abc");
  });

  it("does not include user_id or org_id in payload", () => {
    const entry: ErrorReportEntry = {
      id: "x",
      errorMessage: "fail",
      occurredAt: new Date(),
    };
    const payload = buildReportPayload(entry);
    expect(payload).not.toHaveProperty("user_id");
    expect(payload).not.toHaveProperty("org_id");
  });
});

// ─── HMAC signing ─────────────────────────────────────────────────────────────

describe("signPayload / verifySignature", () => {
  const secret = "test-secret-key";

  it("produces a non-empty hex signature", () => {
    const sig = signPayload({ foo: "bar" }, secret);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifySignature returns true for correct signature", () => {
    const body = JSON.stringify({ foo: "bar" });
    const sig = signPayload({ foo: "bar" }, secret);
    expect(verifySignature(body, sig, secret)).toBe(true);
  });

  it("verifySignature returns false for wrong secret", () => {
    const sig = signPayload({ foo: "bar" }, secret);
    expect(verifySignature(JSON.stringify({ foo: "bar" }), sig, "wrong")).toBe(false);
  });

  it("verifySignature returns false for tampered body", () => {
    const sig = signPayload({ foo: "bar" }, secret);
    expect(verifySignature(JSON.stringify({ foo: "TAMPERED" }), sig, secret)).toBe(false);
  });
});

// ─── enqueueErrorReport ───────────────────────────────────────────────────────

describe("enqueueErrorReport", () => {
  const baseEntry: ErrorReportEntry = {
    id: "entry-1",
    errorMessage: "test crash",
    stackTrace: "/Users/mkh/fulcrum/src/crash.ts:5:3",
    occurredAt: new Date("2025-06-01T12:00:00Z"),
  };

  it("flag OFF: does not enqueue any job", async () => {
    const enqueue = vi.fn();
    const opts: EnqueueErrorReportOptions = {
      featureEnabled: false,
      endpoint: "https://example.com/errors",
      signingSecret: "secret",
      enqueueJob: enqueue,
    };
    await enqueueErrorReport(baseEntry, opts);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("flag ON: enqueues errors:report job with scrubbed payload", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const opts: EnqueueErrorReportOptions = {
      featureEnabled: true,
      endpoint: "https://example.com/errors",
      signingSecret: "secret",
      enqueueJob: enqueue,
    };
    await enqueueErrorReport(baseEntry, opts);
    expect(enqueue).toHaveBeenCalledOnce();
    const [jobName, jobPayload] = enqueue.mock.calls[0]!;
    expect(jobName).toBe("errors:report");
    expect(jobPayload.payload.stack_trace).toContain("<homedir>");
    expect(jobPayload.payload.stack_trace).not.toContain("/Users/mkh");
    expect(jobPayload.endpoint).toBe("https://example.com/errors");
  });

  it("flag ON: job payload includes valid HMAC signature", async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const secret = "hmac-secret";
    const opts: EnqueueErrorReportOptions = {
      featureEnabled: true,
      endpoint: "https://example.com/errors",
      signingSecret: secret,
      enqueueJob: enqueue,
    };
    await enqueueErrorReport(baseEntry, opts);
    const [, jobPayload] = enqueue.mock.calls[0]!;
    const bodyStr = JSON.stringify(jobPayload.payload);
    expect(verifySignature(bodyStr, jobPayload.signature, secret)).toBe(true);
  });

  it("flag ON, no endpoint: skips enqueue gracefully", async () => {
    const enqueue = vi.fn();
    const opts: EnqueueErrorReportOptions = {
      featureEnabled: true,
      endpoint: undefined,
      signingSecret: "secret",
      enqueueJob: enqueue,
    };
    await enqueueErrorReport(baseEntry, opts);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

// ─── doctor check integration ─────────────────────────────────────────────────

describe("error reporting doctor check via platform checks", () => {
  it("flag OFF: platform.error_reporting status is skip", async () => {
    const { runPlatformDoctorChecks } = await import("../platform/doctor-checks.ts");
    const results = await runPlatformDoctorChecks({
      errorReporting: { featureEnabled: false },
    });
    const check = results.find((r) => r.name === "platform.error_reporting");
    expect(check).toBeDefined();
    expect(check!.status).toBe("skip");
  });

  it("flag ON + endpoint reachable: platform.error_reporting is pass", async () => {
    const { runPlatformDoctorChecks } = await import("../platform/doctor-checks.ts");
    const results = await runPlatformDoctorChecks({
      errorReporting: {
        featureEnabled: true,
        endpointConfigured: true,
        lastReportStatus: "ok",
      },
    });
    const check = results.find((r) => r.name === "platform.error_reporting");
    expect(check!.status).toBe("pass");
  });

  it("flag ON + 4xx response: platform.error_reporting is degraded (warn)", async () => {
    const { runPlatformDoctorChecks } = await import("../platform/doctor-checks.ts");
    const results = await runPlatformDoctorChecks({
      errorReporting: {
        featureEnabled: true,
        endpointConfigured: true,
        lastReportStatus: "4xx",
      },
    });
    const check = results.find((r) => r.name === "platform.error_reporting");
    expect(check!.status).toBe("warn");
    expect(check!.message).toContain("degraded");
  });

  it("flag ON + no endpoint: platform.error_reporting is fail", async () => {
    const { runPlatformDoctorChecks } = await import("../platform/doctor-checks.ts");
    const results = await runPlatformDoctorChecks({
      errorReporting: {
        featureEnabled: true,
        endpointConfigured: false,
        lastReportStatus: undefined,
      },
    });
    const check = results.find((r) => r.name === "platform.error_reporting");
    expect(check!.status).toBe("fail");
  });
});
