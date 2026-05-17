import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import { run as runSettingsCommand } from "./settings.ts";

const MIGRATED_COMMANDS = [
  "apps/cli/src/import.ts",
  "apps/cli/src/export.ts",
  "apps/cli/src/sprints.ts",
  "apps/cli/src/artifact.ts",
  "apps/cli/src/connectors.ts",
  "apps/cli/src/notify.ts",
  "apps/cli/src/settings.ts",
];

const CLI_RUNTIME_BOUNDARY_SURFACES = [
  { name: "agent", file: "apps/cli/src/agent.ts" },
  { name: "doctor", file: "apps/cli/src/doctor.ts" },
  { name: "routing", file: "apps/cli/src/commands/routing.ts" },
] as const;

const PRODUCT_KERNEL_PATTERN = `product-${"kernel"}`;
const PRODUCT_DB_PATTERN = `${"Product"}${"Db"}`;

const RUNTIME_BOUNDARY_PATTERNS = [
  new RegExp(`open${"Pglite"}`),
  new RegExp(`open${PRODUCT_DB_PATTERN}`),
  new RegExp(PRODUCT_DB_PATTERN),
  new RegExp(`from .*${PRODUCT_KERNEL_PATTERN}`),
  /em\.persist/,
  /em\.flush/,
  /em\.getConnection\(\)\.execute/,
] as const;

const CLI_BOUNDARY_ALLOWLIST = [] as const;

describe("CLI application caller parity", () => {
  test.each(MIGRATED_COMMANDS)("%s does not import product-kernel or PGlite paths", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(new RegExp(`open${"Pglite"}|runMigrations|${PRODUCT_DB_PATTERN}|from .*${PRODUCT_KERNEL_PATTERN}`));
  });

  test("runtime boundary scan covers agent, doctor, and routing surfaces without vendor paths", () => {
    expect(CLI_RUNTIME_BOUNDARY_SURFACES.map((surface) => surface.name)).toEqual([
      "agent",
      "doctor",
      "routing",
    ]);
    expect(CLI_RUNTIME_BOUNDARY_SURFACES.every((surface) => surface.file.startsWith("apps/cli/src/"))).toBe(true);
    expect(CLI_RUNTIME_BOUNDARY_SURFACES.some((surface) => surface.file.includes("vendor/"))).toBe(false);
  });

  test("runtime boundary allowlist is limited to named migration/bootstrap infrastructure", () => {
    expect(CLI_BOUNDARY_ALLOWLIST).toHaveLength(0);
  });

  test.each([...CLI_RUNTIME_BOUNDARY_SURFACES])(
    "$name runtime surface does not bypass application boundaries",
    ({ file }) => {
      const source = readFileSync(file, "utf8");
      for (const pattern of RUNTIME_BOUNDARY_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    },
  );

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

  test("settings get --json emits application-created setting by stable id", async () => {
    const created = {
      id: "11111111-1111-4111-8111-111111111111",
      orgId: "00000000-0000-0000-0000-000000000001",
      key: "public-api",
      value: { enabled: true },
    };
    const output: string[] = [];

    await runSettingsCommand(["get", created.key, "--json"], {
      caller: {
        settings: {
          list: async () => [created],
          get: async ({ key }: { key: string }) => key === created.key ? created : null,
          set: async () => created,
        },
      },
      print: (line) => output.push(line),
      printErr: (line) => {
        throw new Error(line);
      },
      exit: (code) => {
        throw new Error(`unexpected CLI exit ${code}`);
      },
    });

    expect(JSON.parse(output[0]!)).toEqual(created);
    expect(JSON.parse(output[0]!).id).toBe(created.id);
  });
});
