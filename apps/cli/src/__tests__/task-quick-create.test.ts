import { describe, expect, test } from "bun:test";

import { run } from "../commands/tasks.ts";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  const exits: number[] = [];
  return {
    out,
    err,
    exits,
    opts: {
      print: (line: string) => out.push(line),
      printErr: (line: string) => err.push(line),
      exit: (code: number) => exits.push(code),
    },
  };
}

describe("fulcrum tasks new", () => {
  test("shows project scope, sprint, module, and cycle before create in human output", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const io = capture();

    await run([
      "new",
      "--title",
      "Draft launch note",
      "--project",
      "project-1",
      "--sprint",
      "sprint-1",
      "--module",
      "module-1",
      "--cycle",
      "cycle-1",
    ], {
      ...io.opts,
      caller: {
        tasks: {
          list: async (input: unknown) => {
            calls.push({ method: "list", input });
            return [];
          },
          create: async (input: unknown) => {
            calls.push({ method: "create", input });
            return { id: "task-1", title: "Draft launch note" };
          },
        },
      } as never,
    });

    expect(io.exits).toEqual([]);
    expect(io.out.slice(0, 5)).toEqual([
      "Task create scope",
      "Project: project-1",
      "Sprint: sprint-1",
      "Module: module-1",
      "Cycle: cycle-1",
    ]);
    expect(calls).toEqual([
      { method: "list", input: { projectId: "project-1" } },
      {
        method: "create",
        input: {
          title: "Draft launch note",
          projectId: "project-1",
          sprintId: "sprint-1",
          moduleId: "module-1",
          cycleId: "cycle-1",
        },
      },
    ]);
  });

  test("emits recurrence preview and generated-instance summary in JSON output", async () => {
    const io = capture();

    await run([
      "new",
      "--title",
      "Weekly platform review",
      "--project",
      "project-1",
      "--recurrence",
      "weekly",
      "--json",
    ], {
      ...io.opts,
      caller: {
        tasks: {
          list: async () => [],
          create: async (input: unknown) => ({ id: "task-2", ...input as Record<string, unknown> }),
        },
      } as never,
    });

    expect(io.exits).toEqual([]);
    // `fulcrum task new --json` wraps its payload in the canonical
    // `fulcrum.cli.v1` envelope (CLI-TUI-UX §3); the rich create payload is
    // `.result` (prd-cli-build-stage-parity).
    const envelope = JSON.parse(io.out[0]!) as {
      schema: string;
      result: {
        task: { id: string; recurrence: string };
        recurrencePreview: { rule: string; instances: string[]; summary: string };
        generatedInstanceSummary: { count: number; first: string; last: string };
      };
    };
    expect(envelope.schema).toBe("fulcrum.cli.v1");
    const payload = envelope.result;
    expect(payload.task).toMatchObject({ id: "task-2", recurrence: "weekly" });
    expect(payload.recurrencePreview).toMatchObject({
      rule: "weekly",
      instances: ["2026-05-19", "2026-05-26", "2026-06-02"],
    });
    expect(payload.recurrencePreview.summary).toContain("weekly preview");
    expect(payload.generatedInstanceSummary).toEqual({ count: 3, first: "2026-05-19", last: "2026-06-02" });
  });

  test("empty title preserves entered fields and prints retry output", async () => {
    const io = capture();

    await run(["new", "--title", "", "--project", "project-1", "--cycle", "cycle-1", "--json"], {
      ...io.opts,
      caller: { tasks: { list: async () => [], create: async () => ({}) } } as never,
    });

    expect(io.out).toEqual([]);
    expect(io.exits).toEqual([1]);
    expect(io.err[0]).toContain("title is required");
    const payload = JSON.parse(io.err[1]!) as { entered: Record<string, unknown>; retry: string };
    expect(payload.entered).toMatchObject({ projectId: "project-1", cycleId: "cycle-1" });
    // Canonical Build-stage verb name is `task` (CLI-TUI-UX §1.3).
    expect(payload.retry).toContain("fulcrum task new");
    expect(payload.retry).toContain("--project project-1");
  });

  test("duplicate task prevention preserves entered fields and avoids create", async () => {
    const calls: string[] = [];
    const io = capture();

    await run(["new", "--title", "Existing task", "--project", "project-1", "--module", "module-1"], {
      ...io.opts,
      caller: {
        tasks: {
          list: async () => {
            calls.push("list");
            return [{ id: "task-existing", title: "Existing task" }];
          },
          create: async () => {
            calls.push("create");
            return {};
          },
        },
      } as never,
    });

    expect(calls).toEqual(["list"]);
    expect(io.exits).toEqual([1]);
    expect(io.err[0]).toContain("duplicate task title");
    const payload = JSON.parse(io.err[1]!) as { entered: Record<string, unknown>; retry: string };
    expect(payload.entered).toMatchObject({
      title: "Existing task",
      projectId: "project-1",
      moduleId: "module-1",
    });
    expect(payload.retry).toContain("--title 'Existing task'");
  });
});
