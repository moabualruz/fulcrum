import { describe, expect, test } from "bun:test";

import { run as runTasks } from "../commands/tasks.ts";
import { run as runDocs } from "../commands/docs.ts";
import { run as runSettings } from "../settings.ts";

describe("CLI E2E smoke with application callers", () => {
  test("tasks list uses injected tRPC/application caller and prints JSON", async () => {
    const io = captureIo();
    await runTasks(["list", "--json"], {
      ...io.opts,
      caller: { tasks: { list: async () => [{ id: "task-1", title: "Phase 9.5 task" }] } },
    } as never);

    expect(JSON.parse(io.out[0]!)).toEqual([{ id: "task-1", title: "Phase 9.5 task" }]);
    expect(io.exits).toEqual([]);
  });

  test("docs list uses injected tRPC/application caller and prints rows", async () => {
    const io = captureIo();
    await runDocs(["list", "--json"], {
      ...io.opts,
      caller: { docs: { list: async () => [{ id: "doc-1", title: "Phase 9.5 doc" }] } },
    } as never);

    expect(JSON.parse(io.out[0]!)).toEqual([{ id: "doc-1", title: "Phase 9.5 doc" }]);
    expect(io.exits).toEqual([]);
  });

  test("settings list uses injected tRPC/application caller and prints JSON", async () => {
    const io = captureIo();
    await runSettings(["list", "--json"], {
      ...io.opts,
      caller: { settings: { list: async () => [{ key: "theme", value: "dark" }] } },
    } as never);

    expect(JSON.parse(io.out[0]!)).toEqual([{ key: "theme", value: "dark" }]);
    expect(io.exits).toEqual([]);
  });
});

function captureIo() {
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
