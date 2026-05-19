import { describe, expect, test } from "bun:test";

import {
  availableActions,
  isActionableState,
  orderDependencies,
  summarizeBlockers,
} from "./task-dependency-execution.ts";

describe("task-dependency-execution", () => {
  test("orderDependencies puts roots before dependents and breaks ties by label", () => {
    const nodes = [
      { id: "build", label: "Build", state: "queued" as const, dependsOn: ["lint"], blockers: [] },
      { id: "lint", label: "Lint", state: "queued" as const, dependsOn: [], blockers: [] },
      { id: "deploy", label: "Deploy", state: "queued" as const, dependsOn: ["build"], blockers: [] },
      { id: "format", label: "Format", state: "queued" as const, dependsOn: [], blockers: [] },
    ];
    const ordered = orderDependencies(nodes).map((node) => node.id);
    expect(ordered).toEqual(["format", "lint", "build", "deploy"]);
  });

  test("availableActions reflects the current run state", () => {
    expect(availableActions({ id: "x", label: "x", state: "queued", dependsOn: [], blockers: [] }))
      .toEqual(["dispatch", "cancel"]);
    expect(availableActions({ id: "x", label: "x", state: "running", dependsOn: [], blockers: [] }))
      .toEqual(["cancel"]);
    expect(availableActions({ id: "x", label: "x", state: "failed", dependsOn: [], blockers: [] }))
      .toEqual(["retry", "cancel"]);
    expect(availableActions({ id: "x", label: "x", state: "succeeded", dependsOn: [], blockers: [] }))
      .toEqual([]);
  });

  test("isActionableState excludes terminal states", () => {
    expect(isActionableState("succeeded")).toBe(false);
    expect(isActionableState("canceled")).toBe(false);
    expect(isActionableState("queued")).toBe(true);
    expect(isActionableState("blocked")).toBe(true);
  });

  test("summarizeBlockers lists blocker ids when present", () => {
    expect(summarizeBlockers({ id: "x", label: "x", state: "blocked", dependsOn: [], blockers: ["lint", "format"] }))
      .toBe("blocked by lint, format");
    expect(summarizeBlockers({ id: "x", label: "x", state: "running", dependsOn: [], blockers: [] }))
      .toBe("");
  });
});
