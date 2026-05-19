import { describe, expect, test } from "bun:test";

import { RunsControlScreen } from "./runs-screen.ts";

class TestRenderer {
  lines: string[] = [];
  writeln(line = ""): void {
    this.lines.push(line);
  }
  separator(): void {
    this.lines.push("---");
  }
  output(): string {
    return this.lines.join("\n");
  }
}

describe("RunsControlScreen reassignment", () => {
  test("renders inline reassign overlay with transcript seed status", async () => {
    const screen = new RunsControlScreen({
      caller: {
        agent_runs: {
          list: async () => [{ id: "run-1", agent: "claude-code", status: "running", taskTitle: "Ship" }],
          dispatch: async (input) => ({ id: "run-2", status: "pending", ...input }),
          cancel: async () => ({ ok: true }),
          retry: async () => ({ id: "run-3", agent: "codex", status: "pending" }),
          getDeps: async () => [],
        },
      },
    });

    await screen.load();
    await screen.handleKey("a");
    const renderer = new TestRenderer();
    screen.render(renderer as never);
    const output = renderer.output();

    expect(output).toContain("Reassign agent");
    expect(output).toContain("codex [ready]");
    expect(output).toContain("copied transcript seed");
  });
});
