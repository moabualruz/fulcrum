import { describe, expect, test } from "bun:test";

import { run } from "./product.ts";

function testIo() {
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

describe("product CLI large-list bounds", () => {
  test("tasks list passes limit and offset to caller", async () => {
    const calls: unknown[] = [];
    const io = testIo();

    await run(["tasks", "list", "--limit", "50", "--offset", "100", "--json"], {
      ...io.opts,
      caller: {
        tasks: {
          create: async () => ({}),
          list: async (input) => {
            calls.push(input);
            return { data: [{ id: "task-100" }] };
          },
          update: async () => ({}),
        },
      },
    });

    expect(io.err).toEqual([]);
    expect(io.exits).toEqual([]);
    expect(calls).toEqual([{ projectId: undefined, status: undefined, assigneeId: undefined, limit: 50, offset: 100 }]);
    expect(JSON.parse(io.out[0]!)).toEqual([{ id: "task-100" }]);
  });

  test("search keeps bounded default limit and passes offset when provided", async () => {
    const calls: unknown[] = [];
    const io = testIo();

    await run(["search", "needle", "--offset", "25", "--json"], {
      ...io.opts,
      caller: {
        search: {
          query: async (input) => {
            calls.push(input);
            return [{ id: "result-25" }];
          },
        },
      },
    });

    expect(io.err).toEqual([]);
    expect(io.exits).toEqual([]);
    expect(calls).toEqual([{ query: "needle", kind: undefined, limit: 25, offset: 25 }]);
    expect(JSON.parse(io.out[0]!)).toEqual([{ id: "result-25" }]);
  });
});
