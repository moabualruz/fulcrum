import { describe, expect, it } from "bun:test";
import { readdir, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { CI_ENV, STEPS, envForStep } from "../../scripts/ci.ts";

interface SurfaceCoverage {
  surface: string;
  roots: string[];
  match: RegExp;
}

const SURFACES: SurfaceCoverage[] = [
  { surface: "web", roots: ["tests/auth", "apps/web/src", "apps/web/tests"], match: /\.(test|spec)\.ts$/ },
  { surface: "cli", roots: ["tests/cli", "apps/cli/src"], match: /\.test\.ts$/ },
  { surface: "tui", roots: ["tests/tui"], match: /\.test\.ts$/ },
  { surface: "tRPC", roots: ["tests/trpc"], match: /\.test\.ts$/ },
  { surface: "auth", roots: ["tests/auth", "tests/db/auth"], match: /\.(test|spec)\.ts$/ },
  { surface: "db", roots: ["tests/db", "tests/init"], match: /\.test\.ts$/ },
];

async function collectFiles(root: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".svelte-kit") continue;
    const path = join(root, entry);
    const info = await stat(path);
    if (info.isDirectory()) {
      files.push(...await collectFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

describe("P1 test coverage matrix", () => {
  for (const surface of SURFACES) {
    it(`has ${surface.surface} coverage discoverable by CI`, async () => {
      const files = (await Promise.all(surface.roots.map(collectFiles))).flat();
      const matches = files.filter((file) => surface.match.test(file));
      expect(matches.length).toBeGreaterThan(0);
    });
  }

  it("keeps Playwright coverage for auth login/logout routes", async () => {
    const files = await collectFiles("apps/web/tests/e2e");
    const authSpecs = files.filter((file) => /auth.*\.spec\.ts$/.test(file));
    expect(authSpecs.length).toBeGreaterThan(0);
  });
});

describe("scripts/ci.ts baseline gate", () => {
  it("keeps the default CI gate at 23 product stages", () => {
    const names = STEPS.map((step) => step.name);
    expect(names).toEqual([
      "install",
      "typecheck",
      "symphony:lock",
      "symphony:conformance",
      "trpc:permissions",
      "application:unit",
      "test",
      "license-audit",
      "ci:codegen",
      "migration:downgrade",
      "graceful:shutdown",
      "coverage:root",
      "build:all",
      "web:install",
      "web:check",
      "web:build",
      "web:test",
      "coverage:web",
      "ci:schemas",
      "web:a11y",
      "web:e2e:smoke",
      "web:e2e:full",
      "architecture:red",
    ]);
  });

  it("keeps smoke and full e2e in the full-tier baseline", () => {
    const names = STEPS.map((step) => step.name);
    expect(names).toContain("web:e2e:smoke");
    expect(names).toContain("web:e2e:full");
  });

  it("runs root tests through the root test runner", () => {
    const testStep = STEPS.find((step) => step.name === "test");
    expect(testStep?.cmd).toEqual(["bun", "run", "scripts/test-root.ts"]);
  });

  it("runs root tests with a sandbox-safe home without global FULCRUM_HOME", () => {
    const testStep = STEPS.find((step) => step.name === "test");
    if (!testStep) throw new Error("missing test step");
    const testEnv = envForStep(testStep);

    expect(testEnv["HOME"]).toBeDefined();
    expect(testEnv["HOME"]).not.toBe(homedir());
    expect(testEnv["HOME"]!.startsWith(tmpdir())).toBe(true);
    expect(testEnv["FULCRUM_HOME"]).toBeUndefined();
    expect(CI_ENV["FULCRUM_HOME"]).toBeUndefined();
  });

  it("uses a sandbox-safe Bun install cache for nested installs", () => {
    const webInstallStep = STEPS.find((step) => step.name === "web:install");
    if (!webInstallStep) throw new Error("missing web:install step");
    const installEnv = envForStep(webInstallStep);

    expect(installEnv["BUN_INSTALL_CACHE_DIR"]).toBeDefined();
    expect(installEnv["BUN_INSTALL_CACHE_DIR"]!.startsWith(tmpdir())).toBe(true);
  });

  it("keeps Playwright smoke e2e on the host browser cache", () => {
    const e2eStep = STEPS.find((step) => step.name === "web:e2e:smoke");
    if (!e2eStep) throw new Error("missing web:e2e:smoke step");
    const e2eEnv = envForStep(e2eStep);

    expect(e2eEnv["HOME"]).toBe(homedir());
    expect(e2eEnv["FULCRUM_HOME"]).toBeUndefined();
  });

  it("does not hide the Bun compile cache from build:all", () => {
    const buildStep = STEPS.find((step) => step.name === "build:all");
    if (!buildStep) throw new Error("missing build:all step");
    const buildEnv = envForStep(buildStep);

    expect(buildStep.env).toBeUndefined();
    expect(buildEnv).toBe(CI_ENV);
    expect(buildEnv["BUN_INSTALL_CACHE_DIR"]).not.toBe(envForStep(STEPS.find((step) => step.name === "web:install")!)["BUN_INSTALL_CACHE_DIR"]);
  });
});
