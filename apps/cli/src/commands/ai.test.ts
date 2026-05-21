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
      "--json-raw",
    ], { print: (line) => out.push(line), exit: (code) => { throw new Error(`exit ${code}`); } });

    expect(JSON.parse(out[0] ?? "{}")).toMatchObject({
      sessionId: "ai-task-1-plan",
      taskId: "task-1",
      taskTitle: "Ship drawer",
      taskDescription: "Open from task row",
      workspacePath: "/workspace/fulcrum",
    });
  });

  test("accepts root --step/--thread grammar as an AI Assist session alias", async () => {
    const out: string[] = [];
    await run(["--step", "step-7", "--thread", "thread-9", "--json"], {
      print: (line) => out.push(line),
      exit: (code) => {
        throw new Error(`exit ${code}`);
      },
    });

    const envelope = JSON.parse(out[0] ?? "{}") as {
      schema: string;
      command: string;
      args: { task: string; step: string };
      result: { taskId: string; stepScope: string };
    };
    expect(envelope.schema).toBe("fulcrum.cli.v1");
    expect(envelope.command).toBe("fulcrum ai start");
    expect(envelope.args).toMatchObject({ task: "thread-9", step: "step-7" });
    expect(envelope.result).toMatchObject({ taskId: "thread-9", stepScope: "step-7" });
  });
});
