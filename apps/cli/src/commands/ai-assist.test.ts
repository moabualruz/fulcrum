import { describe, expect, test } from "bun:test";

import { run } from "./ai-assist.ts";

describe("fulcrum ai assist", () => {
  test("accepts agent route override flags through the AI Assist command peer", async () => {
    const out: string[] = [];
    await run([
      "start",
      "--task",
      "task-9",
      "--title",
      "Route agents",
      "--agent",
      "codex",
      "--route",
      "build",
      "--workspace",
      "/workspace/fulcrum",
      "--json",
    ], { print: (line) => out.push(line), exit: (code) => { throw new Error(`exit ${code}`); } });

    expect(JSON.parse(out[0] ?? "{}")).toMatchObject({
      sessionId: "ai-task-9-build",
      agent: "codex",
      route: "build",
      workspacePath: "/workspace/fulcrum",
    });
  });

  test("documents prompt edit re-run peer command path", async () => {
    const out: string[] = [];
    await run(["help"], { print: (line) => out.push(line) });

    expect(out.join("\n")).toContain("fulcrum ai start");
  });
});
