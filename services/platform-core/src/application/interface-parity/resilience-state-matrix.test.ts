import { describe, expect, test } from "bun:test";

import {
  REQUIRED_RESILIENCE_STATES,
  findResilienceState,
  listResilienceStates,
} from "./resilience-state-matrix.ts";

describe("resilience state matrix", () => {
  test("covers CLI and TUI operational failure states", () => {
    const ids = REQUIRED_RESILIENCE_STATES.map((state) => state.id);

    expect(ids).toEqual(expect.arrayContaining([
      "cli:missing-api",
      "cli:permission-denied",
      "cli:missing-feature-flag",
      "cli:empty-list",
      "tui:empty-list",
      "tui:unavailable-sidecar",
      "tui:failed-subscription",
      "tui:partial-data",
    ]));
  });

  test("keeps CLI failures off stdout and TUI failures inside screen output", () => {
    for (const state of listResilienceStates("cli").filter((item) => item.expected.exitCode !== 0)) {
      expect(state.expected.stdout, state.id).toBe("empty");
      expect(state.expected.stderr, state.id).toBe("actionable-error");
    }

    for (const state of listResilienceStates("tui")) {
      expect(state.expected.stdout, state.id).toBe("screen");
      expect(state.expected.stderr, state.id).toBe("empty");
    }
  });

  test("names concrete recovery instructions for every state", () => {
    for (const state of REQUIRED_RESILIENCE_STATES) {
      expect(state.trigger.length, state.id).toBeGreaterThan(10);
      expect(state.expected.recovery.length, state.id).toBeGreaterThan(15);
    }
    expect(findResilienceState("tui:failed-subscription")?.expected.recovery).toContain("Unsubscribe");
  });
});
