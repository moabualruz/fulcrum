import { describe, expect, test } from "bun:test";

import { DESTRUCTIVE_ACTIONS, listDestructiveActions } from "./destructive-action-matrix.ts";

describe("destructive action matrix", () => {
  test("inventories destructive CLI and TUI controls", () => {
    expect(DESTRUCTIVE_ACTIONS.map((action) => action.id).sort()).toEqual([
      "cli:artifact-delete-hard",
      "cli:credential-archive",
      "cli:credential-remove",
      "cli:credential-rotate",
      "cli:credential-set",
      "cli:uninstall",
      "tui:artifact-delete",
      "tui:project-delete",
      "tui:run-cancel",
      "tui:secret-delete",
    ]);
  });

  test("severe destructive actions require confirmation or explicit plan flags", () => {
    for (const action of DESTRUCTIVE_ACTIONS.filter((item) => item.severity === "severe")) {
      expect(action.safety.join(" ")).toMatch(/confirm|dry-run|purge explicit flag/);
      expect(action.targetIdField.length).toBeGreaterThan(0);
      expect(action.outputRequirement).toMatch(/Names|names|prints target paths/);
    }
  });

  test("secret operations redact values in every output requirement", () => {
    const secretActions = DESTRUCTIVE_ACTIONS.filter((action) => action.id.includes("credential") || action.id.includes("secret"));

    expect(secretActions.length).toBeGreaterThanOrEqual(3);
    for (const action of secretActions) {
      expect(action.safety.join(" ")).toContain("redact secret values");
      expect(action.outputRequirement).toMatch(/never prints (value|revealed value)/);
    }
  });

  test("can filter by surface for CLI and TUI simulations", () => {
    expect(listDestructiveActions("cli").every((action) => action.surface === "cli")).toBe(true);
    expect(listDestructiveActions("tui").every((action) => action.surface === "tui")).toBe(true);
  });
});
