import { describe, expect, test } from "bun:test";

import { run } from "./runs.ts";

describe("fulcrum runs", () => {
  test("help exposes reassign-adjacent run controls", async () => {
    const out: string[] = [];
    await run(["help"], { print: (line) => out.push(line) });

    expect(out.join("\n")).toContain("fulcrum runs");
    expect(out.join("\n")).toContain("dispatch");
    expect(out.join("\n")).toContain("attach");
  });

  test("dispatch uses agent argument through CLI peer", async () => {
    const out: string[] = [];
    await run(["dispatch", "--task", "task-1", "--agent", "codex", "--json"], {
      caller: {
        runs: { dispatch: async (input: Record<string, unknown>) => ({ id: "run-1", ...input }) },
        orchestration: { dispatchRun: async (input: Record<string, unknown>) => ({ id: "run-1", ...input }) },
      },
      print: (line) => out.push(line),
      exit: (code) => { throw new Error(`exit ${code}`); },
    });

    expect(JSON.parse(out[0] ?? "{}")).toMatchObject({
      id: "run-1",
      taskId: "task-1",
      agentName: "codex",
    });
  });
});
