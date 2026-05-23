import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

type PackageJson = {
  scripts?: Record<string, string>;
  workspaces?: string[];
};

describe("Bun workspace config", () => {
  test("root package exposes every app, package, and service workspace", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;

    expect(packageJson.workspaces).toEqual(["apps/*", "packages/*", "services/*"]);
  });

  test("root package exposes typecheck separately from lint", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;

    expect(packageJson.scripts?.["typecheck"]).toBe("bun run --bun tsc --noEmit");
  });
});
