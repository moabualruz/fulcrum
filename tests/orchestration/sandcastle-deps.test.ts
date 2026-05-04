import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";
import { glob } from "tinyglobby";

const root = process.cwd();

const requiredDependencies = {
  "@ai-hero/sandcastle": "0.5.6",
  effect: "3.20.0",
  "@effect/platform": "0.95.0",
  "@effect/platform-node": "0.105.0",
} as const;

function packageDependencies(): Record<string, string> {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  return packageJson.dependencies ?? {};
}

function effectVersionsFromBunPmLs(output: string): string[] {
  return [...new Set(
    [...output.matchAll(/(?:^|[^\w@/-])effect@([0-9][0-9A-Za-z.+-]*)/g)]
      .map((match) => match[1]!),
  )].sort();
}

function expectSingleEffectVersion(output: string, expectedVersion: string): void {
  expect(effectVersionsFromBunPmLs(output)).toEqual([expectedVersion]);
}

describe("Sandcastle dependency policy", () => {
  test("pins Sandcastle and Effect dependencies exactly", () => {
    const dependencies = packageDependencies();

    for (const [name, version] of Object.entries(requiredDependencies)) {
      expect(dependencies[name]).toBe(version);
    }
  });

  test("rejects duplicate Effect versions in Bun module tree output", () => {
    expect(() => expectSingleEffectVersion([
      "- effect@3.20.0",
      "- effect@3.21.0",
    ].join("\n"), requiredDependencies.effect)).toThrow();
  });

  test("resolves exactly one Effect version in Bun module tree", () => {
    const result = spawnSync("bun", ["pm", "ls", "effect", "--all"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expectSingleEffectVersion(result.stdout, requiredDependencies.effect);
  });

  test("keeps direct Effect imports inside orchestration modules", async () => {
    const sourceFiles = await glob("src/**/*.{ts,tsx,svelte}", {
      cwd: root,
      absolute: true,
      ignore: ["src/web/**"],
    });
    const violations = sourceFiles
      .filter((file) => !relative(root, file).startsWith("src/orchestration/"))
      .filter((file) => {
        const source = readFileSync(file, "utf8");
        return /\bfrom\s+["']effect["']|\bimport\s*\(\s*["']effect["']\s*\)/.test(source);
      })
      .map((file) => relative(root, file));

    expect(violations).toEqual([]);
  });

  test("exports the pinned Sandcastle API version from the sandbox runner stub", () => {
    const runnerPath = join(root, "src/orchestration/sandbox-runner.ts");

    expect(existsSync(runnerPath)).toBe(true);
    expect(readFileSync(runnerPath, "utf8")).toContain(
      'export const SANDCASTLE_API_VERSION = "0.5.6";',
    );
  });
});
