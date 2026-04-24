import { describe, expect, it } from "vitest";
import {
  assertRunTransition,
  assertTaskTransition,
  canTransitionRun,
  canTransitionTask
} from "@fulcrum/shared";

describe("lifecycle transition validation", () => {
  it("allows documented task transitions", () => {
    expect(canTransitionTask("pending", "ready")).toBe(true);
    expect(canTransitionTask("running", "review")).toBe(true);
    expect(canTransitionTask("completed", "archived")).toBe(true);
  });

  it("rejects invalid task transitions", () => {
    expect(canTransitionTask("pending", "completed")).toBe(false);
    expect(() => assertTaskTransition("archived", "ready")).toThrow("Invalid task transition");
  });

  it("prevents run transitions out of terminal states", () => {
    expect(canTransitionRun("running", "cancel_requested")).toBe(true);
    expect(canTransitionRun("failed", "running")).toBe(false);
    expect(() => assertRunTransition("completed", "running")).toThrow("Invalid run transition");
  });
});
