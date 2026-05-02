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
  { surface: "web", roots: ["tests/auth", "src/web/src", "src/web/tests"], match: /\.(test|spec)\.ts$/ },
  { surface: "cli", roots: ["tests/cli", "src/cli"], match: /\.test\.ts$/ },
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
});

describe("scripts/ci.ts baseline gate", () => {
  it("keeps the default CI gate at 12 always-on stages", () => {
    const names = STEPS.map((step) => step.name);
    expect(names).toEqual([
      "install",
      "typecheck",
      "symphony:lock",
      "test",
      "license-audit",
      "build:all",
      "web:install",
      "web:check",
      "web:build",
      "web:test",
      "skills:lint",
      "compress:check",
    ]);
  });

  it("keeps e2e opt-in rather than making local CI browser-dependent", () => {
    const names = STEPS.map((step) => step.name);
    expect(names).not.toContain("web:e2e");
  });

  it("runs root tests with the Svelte condition enabled", () => {
    const testStep = STEPS.find((step) => step.name === "test");
    expect(testStep?.cmd).toEqual(["bun", "test", "--conditions=svelte"]);
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

  it("does not hide the Bun compile cache from build:all", () => {
    const buildStep = STEPS.find((step) => step.name === "build:all");
    if (!buildStep) throw new Error("missing build:all step");
    const buildEnv = envForStep(buildStep);

    expect(buildStep.env).toBeUndefined();
    expect(buildEnv).toBe(CI_ENV);
    expect(buildEnv["BUN_INSTALL_CACHE_DIR"]).not.toBe(envForStep(STEPS.find((step) => step.name === "web:install")!)["BUN_INSTALL_CACHE_DIR"]);
  });
});
