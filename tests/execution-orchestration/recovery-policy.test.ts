import { afterEach, describe, expect, test } from "bun:test";

import {
  BASE_RECOVERY_DELAY_MS,
  RECOVERY_BACKOFF_MULTIPLIER,
  MAX_RECOVERY_DELAY_MS,
  MAX_RECOVERY_RETRIES,
  computeRecoveryDecision,
  formatRecoveryDelay,
} from "@execution-orchestration/domain/recovery-policy.ts";

const originalRandom = Math.random;
const originalDateNow = Date.now;

afterEach(() => {
  Math.random = originalRandom;
  Date.now = originalDateNow;
});

describe("dependency orchestration recovery policy", () => {
  test("retries first recoverable failure with recovery metadata", () => {
    Math.random = () => 0.5;
    Date.now = () => new Date("2026-05-13T12:00:00.000Z").getTime();

    const decision = computeRecoveryDecision({});

    expect(decision.shouldRetry).toBe(true);
    expect(decision.exhausted).toBe(false);
    expect(decision.nextState.recoveryRetryCount).toBe(1);
    expect(decision.nextState.nextRecoveryAt).toBe("2026-05-13T12:01:00.000Z");
    expect(decision.delayMs).toBe(BASE_RECOVERY_DELAY_MS);
  });

  test("increments count and uses exponential backoff without jitter at random 0.5", () => {
    Math.random = () => 0.5;

    const d1 = computeRecoveryDecision({ recoveryRetryCount: 0 });
    const d2 = computeRecoveryDecision({ recoveryRetryCount: 1 });
    const d3 = computeRecoveryDecision({ recoveryRetryCount: 2 });

    expect(d1.nextState.recoveryRetryCount).toBe(1);
    expect(d2.nextState.recoveryRetryCount).toBe(2);
    expect(d3.nextState.recoveryRetryCount).toBe(3);
    expect(d1.delayMs).toBe(BASE_RECOVERY_DELAY_MS);
    expect(d2.delayMs).toBe(BASE_RECOVERY_DELAY_MS * RECOVERY_BACKOFF_MULTIPLIER);
    expect(d3.delayMs).toBe(BASE_RECOVERY_DELAY_MS * RECOVERY_BACKOFF_MULTIPLIER ** 2);
  });

  test("exhausts after max retries and clears recovery metadata", () => {
    const decision = computeRecoveryDecision({
      recoveryRetryCount: MAX_RECOVERY_RETRIES,
      nextRecoveryAt: "2026-05-13T12:00:00.000Z",
    });

    expect(decision.shouldRetry).toBe(false);
    expect(decision.exhausted).toBe(true);
    expect(decision.nextState.recoveryRetryCount).toBeUndefined();
    expect(decision.nextState.nextRecoveryAt).toBeUndefined();
    expect(decision.delayMs).toBe(0);
    expect(computeRecoveryDecision({ recoveryRetryCount: 999 }).exhausted).toBe(true);
  });

  test("applies plus/minus ten percent jitter and caps raw delay", () => {
    Math.random = () => 0.5;
    const noJitter = computeRecoveryDecision({});

    Math.random = () => 1;
    const maxJitter = computeRecoveryDecision({});

    Math.random = () => 0;
    const minJitter = computeRecoveryDecision({});

    expect(noJitter.delayMs).toBe(BASE_RECOVERY_DELAY_MS);
    expect(maxJitter.delayMs).toBeGreaterThan(BASE_RECOVERY_DELAY_MS);
    expect(maxJitter.delayMs).toBeLessThanOrEqual(BASE_RECOVERY_DELAY_MS * 1.1);
    expect(minJitter.delayMs).toBeLessThan(BASE_RECOVERY_DELAY_MS);
    expect(minJitter.delayMs).toBeGreaterThanOrEqual(BASE_RECOVERY_DELAY_MS * 0.9);
    expect(computeRecoveryDecision({ recoveryRetryCount: 2 }).delayMs).toBeLessThanOrEqual(
      MAX_RECOVERY_DELAY_MS * 1.1,
    );
  });

  test("formats delays the way orchestration logs retry backoff", () => {
    expect(formatRecoveryDelay(0)).toBe("0s");
    expect(formatRecoveryDelay(5_000)).toBe("5s");
    expect(formatRecoveryDelay(59_000)).toBe("59s");
    expect(formatRecoveryDelay(60_000)).toBe("1m");
    expect(formatRecoveryDelay(120_000)).toBe("2m");
    expect(formatRecoveryDelay(90_000)).toBe("90s");
    expect(formatRecoveryDelay(150_000)).toBe("150s");
  });
});
