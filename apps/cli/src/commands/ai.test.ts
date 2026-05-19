import { describe, expect, test } from "bun:test";

import { run } from "./ai.ts";

describe("fulcrum ai", () => {
  test("starts an AI Assist session from task context", async () => {
    const out: string[] = [];
    await run([
      "start",
      "--task",
      "task-1",
      "--title",
      "Ship drawer",
      "--description",
      "Open from task row",
      "--agent",
      "codex",
      "--route",
      "plan",
      "--workspace",
      "/workspace/fulcrum",
      "--json",
    ], { print: (line) => out.push(line), exit: (code) => { throw new Error(`exit ${code}`); } });

    expect(JSON.parse(out[0] ?? "{}")).toMatchObject({
      sessionId: "ai-task-1-plan",
      taskId: "task-1",
      taskTitle: "Ship drawer",
      taskDescription: "Open from task row",
      workspacePath: "/workspace/fulcrum",
    });
  });
});
