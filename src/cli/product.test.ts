import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseProductArgs, run as runProduct } from "./product.ts";

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

describe("fulcrum product CLI", () => {
  test("product parser preserves mixed positionals, flags, json, and passthrough", () => {
    const parsed = parseProductArgs([
      "task-1",
      "--status=done",
      "--json",
      "--project",
      "alpha",
      "task-2",
      "--",
      "--literal",
      "tail",
    ]);

    expect(parsed).toEqual({
      positionals: ["task-1", "task-2"],
      flags: {
        "--status": "done",
        "--json": true,
        "--project": "alpha",
      },
      passthrough: ["--literal", "tail"],
    });
  });

  test("product parser rejects unknown flags before swallowing positionals", () => {
    expect(() => parseProductArgs(["task-1", "--bogus", "task-2"])).toThrow(
      "unknown flag: --bogus",
    );
  });

  test("product init --json reports application-backed readiness shape", async () => {
    const io = testIo();
    const prevHome = process.env["FULCRUM_HOME"];
    process.env["FULCRUM_HOME"] = join(await mkdtemp(join(tmpdir(), "fulcrum-product-test-")), ".fulcrum");
    try {
      await runProduct(["init", "--json"], io.opts);
    } finally {
      if (prevHome === undefined) delete process.env["FULCRUM_HOME"];
      else process.env["FULCRUM_HOME"] = prevHome;
    }
    expect(JSON.parse(io.out[0]!)).toEqual(expect.objectContaining({
      ok: true,
      engine: "pglite",
      org: expect.objectContaining({ slug: "default", name: "Local", created: true }),
    }));
  });

  test("product projects list --json uses caller fixture", async () => {
    const io = testIo();
    await runProduct(["projects", "list", "--json"], {
      ...io.opts,
      caller: { projects: { list: async () => [{ id: "p1", slug: "alpha", name: "Alpha" }] } },
    });
    expect(JSON.parse(io.out[0]!)).toEqual([{ id: "p1", slug: "alpha", name: "Alpha" }]);
  });

  test("product tasks create/list/update/bulk/move route through caller", async () => {
    const calls: Array<{ method: string; input: unknown }> = [];
    const caller = {
      tasks: {
        create: async (input: Record<string, unknown>) => {
          calls.push({ method: "create", input });
          return { id: "t1", title: input["title"], status: "pending" };
        },
        list: async (input: Record<string, unknown>) => {
          calls.push({ method: "list", input });
          return [{ id: "t1", title: "Task", status: input["status"] }];
        },
        update: async (input: Record<string, unknown>) => {
          calls.push({ method: "update", input });
          return { id: input["id"], status: input["status"], sprintId: input["sprintId"] };
        },
      },
    };

    for (const argv of [
      ["tasks", "create", "--title", "Fix bug", "--project", "alpha", "--json"],
      ["tasks", "list", "--status", "open", "--project", "alpha", "--json"],
      ["tasks", "update", "t1", "--status", "done", "--json"],
      ["tasks", "bulk", "t1,t2", "--status", "done", "--json"],
      ["tasks", "move", "t1", "--sprint", "s1", "--json"],
    ]) {
      const io = testIo();
      await runProduct(argv, { ...io.opts, caller });
      expect(io.exits).toEqual([]);
      expect(io.out.length).toBe(1);
    }

    expect(calls.map((call) => call.method)).toEqual(["create", "list", "update", "update", "update", "update"]);
  });

  test("product sprints/search/context use caller fixture", async () => {
    const caller = {
      sprints: {
        list: async () => [{ id: "s1", name: "Sprint 1", status: "planned" }],
        start: async ({ id }: { id: string }) => ({ id, status: "active" }),
        close: async ({ id }: { id: string }) => ({ id, status: "completed" }),
      },
      search: {
        query: async () => [{ source_kind: "doc", source_id: "d1", title: "kernel" }],
      },
      context: {
        assemble: async () => ({ taskId: "t1", body: "## Task\nWire CLI" }),
      },
    };

    for (const argv of [
      ["sprints", "list", "--project", "p", "--json"],
      ["sprints", "activate", "s1", "--json"],
      ["sprints", "complete", "s1", "--json"],
      ["search", "kernel", "--kind", "doc", "--json"],
      ["context", "assemble", "--task", "t1", "--json"],
    ]) {
      const io = testIo();
      await runProduct(argv, { ...io.opts, caller });
      expect(io.exits).toEqual([]);
      expect(io.out.length).toBe(1);
    }
  });

  test("invalid product arguments exit 2 with validation error", async () => {
    const io = testIo();
    await runProduct(["tasks", "create", "--project", "alpha"], {
      ...io.opts,
      caller: { tasks: { create: async () => ({}) } },
    });
    expect(io.exits).toEqual([2]);
    expect(io.err[0]).toContain("missing required flag --title");
  });
});
