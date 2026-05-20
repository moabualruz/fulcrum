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

const TASKS = [
  { id: "T-3", key: "T-3", title: "Later", priority: "P2", updatedAt: "2026-05-03T09:00:00Z" },
  { id: "T-1", key: "T-1", title: "First", priority: "P0", updatedAt: "2026-05-03T11:00:00Z" },
  { id: "T-2", key: "T-2", title: "Middle", priority: "P1", updatedAt: "2026-05-03T10:00:00Z" },
];

describe("fulcrum tasks list --sort", () => {
  test("sorts priority ascending and includes JSON sort metadata", async () => {
    const calls: unknown[] = [];
    const io = capture();

    await run(["list", "--sort", "priority:asc", "--json"], {
      ...io.opts,
      caller: {
        tasks: {
          list: async (input: unknown) => {
            calls.push(input);
            return TASKS;
          },
        },
      } as never,
    });

    const payload = sortResult(io.out[0]!);
    expect(payload.data.map((task) => task.key)).toEqual(["T-1", "T-2", "T-3"]);
    expect(payload.sort).toEqual({ field: "priority", direction: "asc" });
    expect(calls).toEqual([{ sortField: "priority", sortDirection: "asc" }]);
    expect(io.err).toEqual([]);
    expect(io.exits).toEqual([]);
  });

  test("sorts priority descending", async () => {
    const io = capture();

    await run(["list", "--sort", "priority:desc", "--json"], {
      ...io.opts,
      caller: { tasks: { list: async () => TASKS } } as never,
    });

    const payload = sortResult(io.out[0]!);
    expect(payload.data.map((task) => task.key)).toEqual(["T-3", "T-2", "T-1"]);
    expect(payload.sort).toEqual({ field: "priority", direction: "desc" });
  });

  test("sorts key ascending with numeric-aware ordering", async () => {
    const io = capture();

    await run(["list", "--sort", "key:asc", "--json"], {
      ...io.opts,
      caller: {
        tasks: {
          list: async () => [
            { id: "T-10", key: "T-10", priority: "P1" },
            { id: "T-2", key: "T-2", priority: "P1" },
            { id: "T-1", key: "T-1", priority: "P1" },
          ],
        },
      } as never,
    });

    const payload = sortResult(io.out[0]!);
    expect(payload.data.map((task) => task.key)).toEqual(["T-1", "T-2", "T-10"]);
  });

  test("invalid field or direction exits 2 with usage hint", async () => {
    const io = capture();

    await run(["list", "--sort", "bogus:asc", "--json"], {
      ...io.opts,
      caller: { tasks: { list: async () => TASKS } } as never,
    });

    expect(io.out).toEqual([]);
    // Canonical Build-stage verb name is `task` (CLI-TUI-UX §1.3).
    expect(io.err.join("\n")).toContain("Usage: fulcrum task list --sort");
    expect(io.exits).toEqual([2]);
  });
});

/**
 * `fulcrum task list --sort --json` wraps its `{ data, sort }` payload in the
 * canonical `fulcrum.cli.v1` envelope (CLI-TUI-UX §3); unwrap `.result`
 * (prd-cli-build-stage-parity).
 */
function sortResult(line: string): { data: Array<{ key: string }>; sort: unknown } {
  const envelope = JSON.parse(line) as { schema: string; result: { data: Array<{ key: string }>; sort: unknown } };
  expect(envelope.schema).toBe("fulcrum.cli.v1");
  return envelope.result;
}
