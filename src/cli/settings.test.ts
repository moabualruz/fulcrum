import { describe, expect, test } from "bun:test";

describe("CLI settings command", () => {
  test("settings list --json prints a JSON array", async () => {
    const { run } = await import("./settings.ts");
    const output: string[] = [];
    await run(["list", "--json"], {
      caller: { settings: { list: async () => [{ key: "theme", value: "dark" }] } },
      print: (line: string) => output.push(line),
      printErr: () => {},
      exit: () => {},
    } as never);
    expect(JSON.parse(output[0]!)).toEqual([{ key: "theme", value: "dark" }]);
  });

  test("settings get prints a value", async () => {
    const { run } = await import("./settings.ts");
    const output: string[] = [];
    await run(["get", "theme"], {
      caller: { settings: { get: async () => ({ key: "theme", value: "dark" }) } },
      print: (line: string) => output.push(line),
      printErr: () => {},
      exit: () => {},
    } as never);
    expect(output[0]).toContain("theme");
    expect(output[0]).toContain("dark");
  });

  test("settings get missing key exits 1", async () => {
    const { run } = await import("./settings.ts");
    const exits: number[] = [];
    await run(["get", "missing"], {
      caller: { settings: { get: async () => null } },
      print: () => {},
      printErr: () => {},
      exit: (code: number) => exits.push(code),
    } as never);
    expect(exits).toEqual([1]);
  });

  test("settings set persists a value", async () => {
    const { run } = await import("./settings.ts");
    const output: string[] = [];
    await run(["set", "theme", "light", "--json"], {
      caller: { settings: { set: async () => ({ key: "theme", value: "light" }) } },
      print: (line: string) => output.push(line),
      printErr: () => {},
      exit: () => {},
    } as never);
    expect(JSON.parse(output[0]!)).toEqual({ key: "theme", value: "light" });
  });

  test("settings set invalid arguments exit 2", async () => {
    const { run } = await import("./settings.ts");
    const exits: number[] = [];
    await run(["set", "theme"], {
      caller: { settings: {} },
      print: () => {},
      printErr: () => {},
      exit: (code: number) => exits.push(code),
    } as never);
    expect(exits).toEqual([2]);
  });
});
