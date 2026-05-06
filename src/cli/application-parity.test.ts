import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const MIGRATED_COMMANDS = [
  "src/cli/import.ts",
  "src/cli/export.ts",
  "src/cli/sprints.ts",
  "src/cli/artifact.ts",
  "src/cli/connectors.ts",
  "src/cli/notify.ts",
  "src/cli/settings.ts",
];

describe("CLI application caller parity", () => {
  test.each(MIGRATED_COMMANDS)("%s does not import product-kernel or PGlite paths", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/openPglite|runMigrations|ProductDb|from .*product-kernel/);
  });

  test("sprints invalid arguments use exit code 2", async () => {
    const { run } = await import("./sprints.ts");
    const exits: number[] = [];
    await run(["add-task", "--sprint-id", "s1"], {
      caller: { sprints: {} },
      print: () => {},
      printErr: () => {},
      exit: (code: number) => {
        exits.push(code);
      },
    } as never);
    expect(exits).toEqual([2]);
  });

  test("artifact missing resource uses exit code 1", async () => {
    const { run } = await import("./artifact.ts");
    const exits: number[] = [];
    await run(["show", "missing", "--json"], {
      caller: {
        artifacts: {
          get: async () => {
            throw new Error("artifact not found: missing");
          },
        },
      },
      print: () => {},
      printErr: () => {},
      exit: (code: number) => {
        exits.push(code);
      },
    } as never);
    expect(exits).toEqual([1]);
  });

  test("connectors list --json emits a JSON array", async () => {
    const { run } = await import("./connectors.ts");
    const output: string[] = [];
    await run(["list", "--json"], {
      caller: { connectors: { list: async () => [{ kind: "github", enabled: true, lastSyncAt: null }] } },
      print: (line: string) => output.push(line),
      printErr: () => {},
      exit: () => {},
    } as never);
    expect(JSON.parse(output[0]!)).toEqual([{ kind: "github", enabled: true, lastSyncAt: null }]);
  });
});
