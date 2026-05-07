import { describe, expect, test } from "bun:test";
import {
  type RunDetailState,
  type RunDetailTab,
  type RunDetailAction,
  initialRunDetailState,
  handleRunDetailKey,
  TABS,
} from "./run-detail-overlay.ts";

const RUN = {
  id: "run-1",
  agent: "claude-code",
  status: "running" as const,
  sandboxMode: true,
  iterationCount: 3,
};

describe("run-detail-overlay", () => {
  test("initialRunDetailState defaults to summary tab", () => {
    const state = initialRunDetailState(RUN);
    expect(state.activeTab).toBe("summary");
    expect(state.run.id).toBe("run-1");
  });

  test("TABS has 4 entries", () => {
    expect(TABS).toEqual(["summary", "transcript", "diff", "artifacts"]);
  });

  test("'l' key switches to transcript tab", () => {
    const state = initialRunDetailState(RUN);
    const action = handleRunDetailKey(state, "l");
    expect(action).toEqual({ type: "switchTab", tab: "transcript" });
  });

  test("'d' key switches to diff tab", () => {
    const state = initialRunDetailState(RUN);
    const action = handleRunDetailKey(state, "d");
    expect(action).toEqual({ type: "switchTab", tab: "diff" });
  });

  test("'a' key switches to artifacts tab", () => {
    const state = initialRunDetailState(RUN);
    const action = handleRunDetailKey(state, "a");
    expect(action).toEqual({ type: "switchTab", tab: "artifacts" });
  });

  test("'c' key emits cancel action for running run", () => {
    const state = initialRunDetailState(RUN);
    const action = handleRunDetailKey(state, "c");
    expect(action).toEqual({ type: "cancel", runId: "run-1" });
  });

  test("'c' key returns null for terminal run", () => {
    const state = initialRunDetailState({ ...RUN, status: "succeeded" });
    const action = handleRunDetailKey(state, "c");
    expect(action).toBeNull();
  });

  test("'r' key emits retry action for failed run", () => {
    const state = initialRunDetailState({ ...RUN, status: "failed" });
    const action = handleRunDetailKey(state, "r");
    expect(action).toEqual({ type: "retry", runId: "run-1" });
  });

  test("'r' key returns null for running run", () => {
    const state = initialRunDetailState(RUN);
    const action = handleRunDetailKey(state, "r");
    expect(action).toBeNull();
  });

  test("'Escape' key emits close action", () => {
    const state = initialRunDetailState(RUN);
    const action = handleRunDetailKey(state, "Escape");
    expect(action).toEqual({ type: "close" });
  });

  test("unknown key returns null", () => {
    const state = initialRunDetailState(RUN);
    const action = handleRunDetailKey(state, "x");
    expect(action).toBeNull();
  });

  test("summary tab shows sandboxMode and iterationCount", () => {
    const state = initialRunDetailState(RUN);
    expect(state.run.sandboxMode).toBe(true);
    expect(state.run.iterationCount).toBe(3);
  });
});
