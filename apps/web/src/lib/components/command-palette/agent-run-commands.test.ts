import { describe, expect, test } from "bun:test";
import {
  agentTestCommand,
  runsCancelCommand,
  runsRetryCommand,
  type CommandAction,
} from "./agent-run-commands.ts";

describe("agent-run-commands", () => {
  test("agentTestCommand resolves to testProfile mutation", () => {
    const cmd = agentTestCommand("claude-code");
    expect(cmd.id).toBe("agents-test-claude-code");
    expect(cmd.label).toBe("agents test claude-code");
    const action = cmd.resolve();
    expect(action).toEqual({
      mutation: "agents.testProfile",
      args: { name: "claude-code" },
    });
  });

  test("runsCancelCommand resolves to runs.cancel mutation", () => {
    const cmd = runsCancelCommand("run-42");
    expect(cmd.id).toBe("runs-cancel-run-42");
    expect(cmd.label).toBe("runs cancel run-42");
    const action = cmd.resolve();
    expect(action).toEqual({
      mutation: "runs.cancel",
      args: { id: "run-42" },
    });
  });

  test("runsRetryCommand resolves to runs.retry mutation", () => {
    const cmd = runsRetryCommand("run-99");
    expect(cmd.id).toBe("runs-retry-run-99");
    expect(cmd.label).toBe("runs retry run-99");
    const action = cmd.resolve();
    expect(action).toEqual({
      mutation: "runs.retry",
      args: { id: "run-99" },
    });
  });
});
