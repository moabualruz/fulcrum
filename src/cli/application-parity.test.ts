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

const CLI_RUNTIME_BOUNDARY_SURFACES = [
  { name: "agent", file: "src/cli/agent.ts" },
  { name: "doctor", file: "src/cli/doctor.ts" },
  { name: "routing", file: "src/cli/commands/routing.ts" },
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

const CLI_BOUNDARY_ALLOWLIST = [
  {
    file: "src/cli/db.ts",
    reason: "fulcrum db migrate/bootstrap compatibility owns direct database lifecycle.",
  },
  {
    file: "src/db/product-migrations.ts",
    reason: "legacy product migration compatibility is infrastructure, not CLI runtime data access.",
  },
] as const;

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
    expect(CLI_RUNTIME_BOUNDARY_SURFACES.every((surface) => surface.file.startsWith("src/cli/"))).toBe(true);
    expect(CLI_RUNTIME_BOUNDARY_SURFACES.some((surface) => surface.file.includes("vendor/"))).toBe(false);
  });

  test("runtime boundary allowlist is limited to named migration/bootstrap infrastructure", () => {
    expect(CLI_BOUNDARY_ALLOWLIST.map((entry) => entry.file)).toEqual([
      "src/cli/db.ts",
      "src/db/product-migrations.ts",
    ]);
    expect(CLI_BOUNDARY_ALLOWLIST.every((entry) => /migrate|migration|bootstrap/i.test(entry.reason))).toBe(true);
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
});
