/**
 * Phase 03 integration tests — Workflow Runtime (orchestrator lifecycle).
 *
 * Tests the state machine transitions, retry logic, and stall detection
 * without requiring a live database (unit-tests the pure logic exports).
 */

import { describe, expect, test } from "bun:test";
import {
  AGENT_RUN_ORCHESTRATION_STATES,
  type AgentRunOrchestrationState,
} from "../orchestration/states.ts";
import { calcRetryDelay, type RunRef } from "../orchestration/symphony/retry.ts";
import {
  WorkflowConfigSchema,
  type WorkflowConfig,
} from "../orchestration/symphony/schemas.ts";
import { ClaimConflictError } from "../orchestration/symphony/orchestrator.ts";
import { StallScanTimeoutError } from "../orchestration/symphony/stall.ts";

describe("Phase 03: Workflow Runtime — Orchestrator Lifecycle", () => {
  // --- State Machine ---

  test("AGENT_RUN_ORCHESTRATION_STATES contains expected terminal states", () => {
    const terminals: AgentRunOrchestrationState[] = ["succeeded", "failed", "timed_out", "cancelled"];
    for (const t of terminals) {
      expect(AGENT_RUN_ORCHESTRATION_STATES).toContain(t);
    }
  });

  test("orchestration states include full lifecycle path", () => {
    // unclaimed → claimed → running → succeeded (happy path)
    const happyPath: AgentRunOrchestrationState[] = [
      "unclaimed",
      "claimed",
      "running",
      "succeeded",
    ];
    for (const state of happyPath) {
      expect(AGENT_RUN_ORCHESTRATION_STATES).toContain(state);
    }
  });

  test("orchestration states include retry_queued for retry flow", () => {
    expect(AGENT_RUN_ORCHESTRATION_STATES).toContain("retry_queued");
  });

  test("orchestration states include stalled for stall detection", () => {
    expect(AGENT_RUN_ORCHESTRATION_STATES).toContain("stalled");
  });

  // --- Retry Logic ---

  test("calcRetryDelay uses exponential backoff capped by maxMs", () => {
    const maxMs = 300_000;
    // attempt 1: 10_000 * 2^0 = 10_000
    expect(calcRetryDelay(1, maxMs)).toBe(10_000);
    // attempt 2: 10_000 * 2^1 = 20_000
    expect(calcRetryDelay(2, maxMs)).toBe(20_000);
    // attempt 3: 10_000 * 2^2 = 40_000
    expect(calcRetryDelay(3, maxMs)).toBe(40_000);
    // large attempt: capped at maxMs
    expect(calcRetryDelay(20, maxMs)).toBe(maxMs);
  });

  test("calcRetryDelay normalizes attempt < 1 to 1", () => {
    expect(calcRetryDelay(0, 300_000)).toBe(10_000);
    expect(calcRetryDelay(-5, 300_000)).toBe(10_000);
  });

  // --- WorkflowConfig defaults ---

  test("WorkflowConfigSchema applies sensible defaults", () => {
    const config = WorkflowConfigSchema.parse({});
    expect(config.stallTimeoutMs).toBe(300_000);
    expect(config.maxAttempts).toBe(3);
    expect(config.maxRetryBackoffMs).toBe(300_000);
    expect(config.keepOnFailure).toBe(false);
  });

  // --- Error types ---

  test("ClaimConflictError carries taskId", () => {
    const err = new ClaimConflictError("task-123");
    expect(err.taskId).toBe("task-123");
    expect(err.name).toBe("ClaimConflictError");
    expect(err.message).toContain("task-123");
  });

  test("StallScanTimeoutError carries timeout value in message", () => {
    const err = new StallScanTimeoutError(5000);
    expect(err.name).toBe("StallScanTimeoutError");
    expect(err.message).toContain("5000");
  });
});
