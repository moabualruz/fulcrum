import { afterEach, describe, expect, mock, test } from "bun:test";
import { TRPCError } from "@trpc/server";

import { AppConflictError, AppValidationError } from "../application/errors.ts";
import { appErrorToTrpcError } from "../application/error-mapping.ts";
import type { RoutingDecision } from "./types.ts";

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const TASK_ID = "00000000-0000-4000-8000-000000000002";

describe("router adapters delegate to application operations", () => {
  afterEach(async () => {
    const [
      { configureConflictDetector },
      { configureNoMatchPrompt },
      { configureRoutingTelemetry },
    ] = await Promise.all([
      import("./conflict-detector.ts"),
      import("./no-match-prompt.ts"),
      import("./telemetry.ts"),
    ]);
    configureConflictDetector({ routingRuleRepository: null });
    configureNoMatchPrompt({ routingRuleRepository: null });
    configureRoutingTelemetry({ eventRepository: null });
  });

  test("recordRoutingEvent calls application telemetry command", async () => {
    const { configureRoutingTelemetry, recordRoutingEvent } = await import("./telemetry.ts");
    const command = mock(async () => {});

    configureRoutingTelemetry({
      application: {
        recordRoutingEvent: command,
      },
    });

    const decision: RoutingDecision = {
      ruleId: "rule-1",
      source: "rule",
      agent: "codex",
      confidence: 1,
    };

    await recordRoutingEvent(decision, TASK_ID, ORG_ID, false);

    expect(command).toHaveBeenCalledTimes(1);
    expect(command.mock.calls[0]?.[0]).toMatchObject({
      taskId: TASK_ID,
      orgId: ORG_ID,
      dryRun: false,
      decision,
    });
  });

  test("detectConflicts calls application conflict query", async () => {
    const { configureConflictDetector, detectConflicts } = await import("./conflict-detector.ts");
    const query = mock(async () => ["active-rule-1"]);

    configureConflictDetector({
      application: {
        detectRoutingConflicts: query,
      },
    });

    const input = {
      proposedConditions: { all: [{ fact: "task.kind", operator: "equal", value: "bug" }] },
      proposedActions: { agent: "codex" },
      orgId: ORG_ID,
      projectId: null,
    };

    await expect(detectConflicts(input)).resolves.toEqual(["active-rule-1"]);
    expect(query).toHaveBeenCalledWith(input);
  });

  test("learnRule calls application learned-rule command", async () => {
    const { configureNoMatchPrompt, learnRule } = await import("./no-match-prompt.ts");
    const rule = { id: "learned-rule-1", enabled: true };
    const command = mock(async () => rule);

    configureNoMatchPrompt({
      application: {
        learnRoutingRule: command,
      },
    });

    const facts = {
      task: { kind: "bug", priority: "high", tags: [], title: "Fix bug" },
    };

    await expect(learnRule(facts, "codex", ORG_ID)).resolves.toBe(rule);
    expect(command).toHaveBeenCalledWith({
      facts,
      agent: "codex",
      orgId: ORG_ID,
      projectId: undefined,
    });
  });

  test("RoutingService maps application AppError to tRPC-compatible codes", async () => {
    expect(appErrorToTrpcError(new AppValidationError("bad input")).code).toBe("BAD_REQUEST");
    expect(appErrorToTrpcError(new AppConflictError("rule conflict")).code).toBe("CONFLICT");
    expect(appErrorToTrpcError(new Error("boom"))).toBeInstanceOf(TRPCError);
  });
});
