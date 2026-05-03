import { describe, expect, test } from "bun:test";
import {
  type AgentsPaneState,
  initialAgentsPaneState,
  handleAgentsPaneKey,
  profileTableRows,
  type AgentsPaneAction,
  type ProfileTableRow,
} from "./agents-pane.ts";

const SIX_PROFILES: ProfileTableRow[] = [
  { id: "1", name: "claude-code", cliPath: "/bin/claude", lastTestedAt: null, testPassed: null },
  { id: "2", name: "codex", cliPath: "/bin/codex", lastTestedAt: null, testPassed: true },
  { id: "3", name: "gemini", cliPath: "/bin/gemini", lastTestedAt: null, testPassed: false },
  { id: "4", name: "opencode", cliPath: "/bin/opencode", lastTestedAt: null, testPassed: null },
  { id: "5", name: "pi", cliPath: "/bin/pi", lastTestedAt: null, testPassed: true },
  { id: "6", name: "custom", cliPath: "/bin/custom", lastTestedAt: null, testPassed: null },
];

describe("agents-pane", () => {
  test("profileTableRows renders 6 rows from profiles", () => {
    const rows = profileTableRows(SIX_PROFILES);
    expect(rows).toHaveLength(6);
    expect(rows[0]!.name).toBe("claude-code");
    expect(rows[1]!.testPassed).toBe(true);
    expect(rows[2]!.testPassed).toBe(false);
  });

  test("initialAgentsPaneState defaults to selectedIndex 0", () => {
    const state = initialAgentsPaneState(SIX_PROFILES);
    expect(state.selectedIndex).toBe(0);
    expect(state.profiles).toHaveLength(6);
  });

  test("'t' key emits testProfile action for selected profile", () => {
    const state = initialAgentsPaneState(SIX_PROFILES);
    const action = handleAgentsPaneKey(state, "t");
    expect(action).toEqual({ type: "testProfile", profileId: "1" });
  });

  test("'e' key emits editProfile action for selected profile", () => {
    const state = initialAgentsPaneState(SIX_PROFILES);
    const action = handleAgentsPaneKey(state, "e");
    expect(action).toEqual({ type: "editProfile", profileId: "1" });
  });

  test("'Enter' key emits openRunHistory action for selected profile", () => {
    const state = initialAgentsPaneState(SIX_PROFILES);
    const action = handleAgentsPaneKey(state, "Enter");
    expect(action).toEqual({ type: "openRunHistory", profileId: "1", agentName: "claude-code" });
  });

  test("'j' / 'k' navigate selection", () => {
    let state = initialAgentsPaneState(SIX_PROFILES);
    // j moves down
    const downAction = handleAgentsPaneKey(state, "j");
    expect(downAction).toEqual({ type: "navigate", selectedIndex: 1 });

    // at index 0, k stays at 0
    const upAction = handleAgentsPaneKey(state, "k");
    expect(upAction).toEqual({ type: "navigate", selectedIndex: 0 });
  });

  test("navigation clamps to bounds", () => {
    const state: AgentsPaneState = {
      profiles: SIX_PROFILES,
      selectedIndex: 5,
    };
    const action = handleAgentsPaneKey(state, "j");
    expect(action).toEqual({ type: "navigate", selectedIndex: 5 });
  });

  test("unknown key returns null", () => {
    const state = initialAgentsPaneState(SIX_PROFILES);
    const action = handleAgentsPaneKey(state, "x");
    expect(action).toBeNull();
  });
});
