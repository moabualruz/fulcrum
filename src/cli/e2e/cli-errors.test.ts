import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";

import { run as runTasks } from "../commands/tasks.ts";
import { run as runSettings } from "../settings.ts";

describe("CLI E2E error handling", () => {
  test("unknown command exits 2 without touching caller", async () => {
    const io = captureIo();
    await runTasks(["bogus"], { ...io.opts, caller: { tasks: {} } } as never);

    expect(io.exits).toEqual([2]);
    expect(io.err.join("\n")).toContain("unknown command");
  });

  test("application authorization error maps to command failure", async () => {
    const io = captureIo();
    await runTasks(["list"], {
      ...io.opts,
      caller: {
        tasks: {
          list: async () => {
            throw new TRPCError({ code: "FORBIDDEN", message: "denied" });
          },
        },
      },
    } as never);

    expect(io.exits).toEqual([1]);
    expect(io.err.join("\n")).toContain("FORBIDDEN: denied");
  });

  test("settings missing key exits 1", async () => {
    const io = captureIo();
    await runSettings(["get", "missing"], {
      ...io.opts,
      caller: { settings: { get: async () => null } },
    } as never);

    expect(io.exits).toEqual([1]);
    expect(io.err.join("\n")).toContain("setting not found: missing");
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
