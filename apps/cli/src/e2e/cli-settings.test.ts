import { describe, expect, test } from "bun:test";

import { run as runSettings } from "../settings.ts";

describe("CLI E2E settings workflow", () => {
  test("list get and set route through application settings caller", async () => {
    const calls: string[] = [];
    const io = captureIo();
    const caller = {
      settings: {
        list: async () => {
          calls.push("list");
          return [{ key: "theme", value: "dark" }];
        },
        get: async (input: { key: string }) => {
          calls.push(`get:${input.key}`);
          return { key: input.key, value: "dark" };
        },
        set: async (input: { key: string; value: string }) => {
          calls.push(`set:${input.key}:${input.value}`);
          return input;
        },
      },
    };

    await runSettings(["list", "--json"], { ...io.opts, caller });
    await runSettings(["get", "theme", "--json"], { ...io.opts, caller });
    await runSettings(["set", "theme", "light", "--json"], { ...io.opts, caller });

    expect(calls).toEqual(["list", "get:theme", "set:theme:light"]);
    expect(io.out.map((line) => JSON.parse(line))).toEqual([
      [{ key: "theme", value: "dark" }],
      { key: "theme", value: "dark" },
      { key: "theme", value: "light" },
    ]);
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
