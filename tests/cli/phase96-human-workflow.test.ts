import { describe, expect, test } from "bun:test";

describe("Phase 09.6 CLI human workflow", () => {
  test("work inspect requests a mode-specific relationship hub and prints links plus trace", async () => {
    const { run } = await import("../../apps/cli/src/commands/work.ts");
    const calls: unknown[] = [];
    const lines: string[] = [];
    const caller = {
      work: {
        inspect: async (input: unknown) => {
          calls.push(input);
          return {
            task: { id: "task_1", title: "Ship setup", taskType: "story" },
            mode: { id: "agent-run", title: "Agent Run" },
            links: {
              docs: [{ id: "doc_1", title: "Spec" }],
              runs: [{ id: "run_1", state: "ready" }],
            },
            trace: {
              projectId: "proj_1",
              entity: { kind: "work_item", id: "task_1" },
              audit: [{ id: "evt_1", verb: "inspected" }],
            },
          };
        },
      },
    };

    await run(["inspect", "task_1", "--mode", "agent-run", "--json"], {
      caller,
      print: (line) => lines.push(line),
      printErr: () => {},
      exit: () => {},
    });

    expect(calls[0]).toEqual({ id: "task_1", mode: "agent-run" });
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      task: { id: "task_1" },
      links: { docs: [{ id: "doc_1" }], runs: [{ id: "run_1" }] },
      trace: { projectId: "proj_1", entity: { kind: "work_item", id: "task_1" } },
    });
  });

  test("work create forwards type, hierarchy, cycle, module, and project scope", async () => {
    const { run } = await import("../../apps/cli/src/commands/work.ts");
    const calls: unknown[] = [];
    const caller = {
      work: {
        create: async (input: unknown) => {
          calls.push(input);
          return { task: { id: "task_2" }, links: {}, trace: { projectId: "proj_1" } };
        },
      },
    };

    await run([
      "create",
      "--title",
      "Build board",
      "--type",
      "story",
      "--parent",
      "epic_1",
      "--cycle",
      "cycle_1",
      "--module",
      "module_1",
      "--project",
      "proj_1",
      "--json",
    ], {
      caller,
      print: () => {},
      printErr: () => {},
      exit: () => {},
    });

    expect(calls[0]).toEqual({
      title: "Build board",
      taskType: "story",
      parentId: "epic_1",
      cycleId: "cycle_1",
      moduleId: "module_1",
      projectId: "proj_1",
    });
  });
});
