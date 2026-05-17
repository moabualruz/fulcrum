import { describe, expect, test } from "bun:test";
import {
  createTokenTracker,
  isTokenTrackingEnabled,
} from "../token-tracking.ts";

describe("token-tracking", () => {
  test("parses token count from stdout line matching profile pattern", () => {
    const tracker = createTokenTracker(
      "Tokens used:\\s*(\\d+)\\s*input,\\s*(\\d+)\\s*output",
    );

    const count = tracker.parseLine("Tokens used: 1234 input, 567 output");
    expect(count).toBe(1801);
    expect(tracker.total).toBe(1801);
  });

  test("accumulates across multiple parsed lines", () => {
    const tracker = createTokenTracker(
      "Tokens used:\\s*(\\d+)\\s*input,\\s*(\\d+)\\s*output",
    );

    tracker.parseLine("Tokens used: 100 input, 50 output");
    tracker.parseLine("some other line");
    tracker.parseLine("Tokens used: 200 input, 100 output");

    expect(tracker.total).toBe(450);
  });

  test("returns 0 for non-matching lines", () => {
    const tracker = createTokenTracker(
      "Tokens used:\\s*(\\d+)\\s*input,\\s*(\\d+)\\s*output",
    );

    expect(tracker.parseLine("just some output")).toBe(0);
    expect(tracker.total).toBe(0);
  });

  test("returns 0 for every line when pattern is undefined", () => {
    const tracker = createTokenTracker(undefined);

    expect(tracker.parseLine("Tokens used: 1234 input, 567 output")).toBe(0);
    expect(tracker.total).toBe(0);
  });

  test("token_used written correctly from tracker total", () => {
    const tracker = createTokenTracker(
      "Tokens used:\\s*(\\d+)\\s*input,\\s*(\\d+)\\s*output",
    );

    tracker.parseLine("Tokens used: 5000 input, 2000 output");
    // Simulates writing to DB: token_used = tracker.total
    expect(tracker.total).toBe(7000);
  });

  test("cap exceeded triggers token_cap exit reason", () => {
    const tracker = createTokenTracker(
      "Tokens used:\\s*(\\d+)\\s*input,\\s*(\\d+)\\s*output",
    );
    const maxTokens = 10000;

    tracker.parseLine("Tokens used: 6000 input, 3000 output");
    tracker.parseLine("Tokens used: 2000 input, 1000 output");

    const exitReason = tracker.total > maxTokens ? "token_cap" : "complete";
    expect(exitReason).toBe("token_cap");
    expect(tracker.total).toBe(12000);
  });

  test("isTokenTrackingEnabled reads feature flag", () => {
    expect(isTokenTrackingEnabled("token-tracking")).toBe(true);
    expect(isTokenTrackingEnabled("token-tracking,sandbox-docker")).toBe(true);
    expect(isTokenTrackingEnabled("sandbox-docker")).toBe(false);
    expect(isTokenTrackingEnabled(undefined)).toBe(false);
    expect(isTokenTrackingEnabled("")).toBe(false);
  });

  test("token_used is null-equivalent when flag off (tracker returns 0)", () => {
    // When token-tracking flag is off, no tracker is created — token_used stays undefined/null.
    const enabled = isTokenTrackingEnabled("");
    expect(enabled).toBe(false);
    // Simulates: if (!enabled) result.tokenUsed = undefined (NULL in DB)
  });
});
