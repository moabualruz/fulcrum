/**
 * Phase 03 integration tests — Dispatch Parity (CLI/tRPC/TUI/Web).
 *
 * Verifies that the orchestration schemas shared across surfaces produce
 * consistent validation results, proving dispatch parity at the data layer.
 */

import { describe, expect, test } from "bun:test";
import {
  OrchestrationInput,
  OrchestrationStatusSchema,
  OrchestrationStrategySchema,
  ListOrchestrationInput,
  type OrchestrationInputType,
} from "../trpc/schemas/orchestration.ts";
import { AgentRunOrchestrationStateSchema } from "../orchestration/symphony/schemas.ts";

const validUuid = "a1234567-89ab-4def-8123-456789abcdef";

describe("Phase 03: Dispatch Parity — CLI/tRPC/TUI/Web", () => {
  // --- OrchestrationInput (shared across all surfaces) ---

  test("OrchestrationInput validates well-formed input", () => {
    const input = {
      orgId: validUuid,
      name: "Deploy wave 1",
      strategy: "parallel",
      agentIds: ["agent-1", "agent-2"],
      description: "Run parallel deploy",
    };
    const result = OrchestrationInput.safeParse(input);
    expect(result.success).toBe(true);
  });

  test("OrchestrationInput rejects missing orgId", () => {
    const input = {
      name: "Deploy",
      strategy: "sequential",
      agentIds: [],
      description: "test",
    };
    const result = OrchestrationInput.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("OrchestrationInput rejects invalid strategy", () => {
    const input = {
      orgId: validUuid,
      name: "Deploy",
      strategy: "invalid-strategy",
      agentIds: [],
      description: "test",
    };
    const result = OrchestrationInput.safeParse(input);
    expect(result.success).toBe(false);
  });

  // --- Strategy + Status enums are consistent across surfaces ---

  test("all 5 strategies are recognized", () => {
    const strategies = ["sequential", "parallel", "wave", "fan-out", "pipeline"];
    for (const s of strategies) {
      expect(OrchestrationStrategySchema.safeParse(s).success).toBe(true);
    }
  });

  test("all 6 orchestration statuses are recognized", () => {
    const statuses = ["pending", "dispatching", "running", "completed", "failed", "cancelled"];
    for (const s of statuses) {
      expect(OrchestrationStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  // --- AgentRunOrchestrationStateSchema (shared across tRPC/CLI/TUI/Web) ---

  test("AgentRunOrchestrationStateSchema validates symphony-level states", () => {
    const states = ["unclaimed", "claimed", "running", "succeeded", "failed", "cancelled", "retry_queued"];
    for (const s of states) {
      expect(AgentRunOrchestrationStateSchema.safeParse(s).success).toBe(true);
    }
    expect(AgentRunOrchestrationStateSchema.safeParse("bogus").success).toBe(false);
  });

  // --- ListOrchestrationInput filter parity ---

  test("ListOrchestrationInput accepts empty filter (all surfaces list all)", () => {
    expect(ListOrchestrationInput.safeParse({}).success).toBe(true);
  });

  test("ListOrchestrationInput accepts status filter", () => {
    const result = ListOrchestrationInput.safeParse({ status: "running" });
    expect(result.success).toBe(true);
  });

  test("ListOrchestrationInput accepts strategy filter", () => {
    const result = ListOrchestrationInput.safeParse({ strategy: "wave" });
    expect(result.success).toBe(true);
  });
});
