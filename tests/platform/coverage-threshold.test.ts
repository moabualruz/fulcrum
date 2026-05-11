import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { STEPS } from "../../scripts/ci.ts";

describe("Phase 09 coverage threshold gates", () => {
  test("root test runner supports coverage without changing normal discovery", () => {
    const source = readFileSync("scripts/test-root.ts", "utf8");

    expect(source).toContain("--coverage");
    expect(source).toContain("--root-coverage");
    expect(source).toContain("coverageArgs");
    expect(source).toContain("FULCRUM_ROOT_TEST_TIMEOUT_MS");
    expect(source).toContain("--timeout=");
    expect(source).toContain("FULCRUM_ROOT_TEST_COVERAGE_BATCH_SIZE");
    expect(source).toContain("coverageBatchArgs");
    expect(source).toContain("config/bunfig.root-coverage-batch.toml");
    expect(source).toContain("files.slice");
    expect(source).toContain("bun");
    expect(source).toContain("test");
  });

  test("root Bun coverage config enforces 80 percent lines and batch config disables per-batch threshold", () => {
    const bunfig = readFileSync("bunfig.toml", "utf8");
    const batchBunfig = readFileSync("config/bunfig.root-coverage-batch.toml", "utf8");

    expect(bunfig).toContain("coverageThreshold");
    expect(bunfig).toContain("0.80");
    expect(batchBunfig).toContain("coverageThreshold = 0.0");
    expect(batchBunfig).toContain("preload");
  });

  test("local CI contains root and web coverage gates", () => {
    const root = STEPS.find((step) => step.name === "coverage:root");
    const web = STEPS.find((step) => step.name === "coverage:web");

    expect(root?.cmd).toEqual(["bun", "run", "scripts/test-root.ts", "--root-coverage"]);
    expect(web?.cwd).toBe("apps/web");
    expect(web?.cmd).toEqual(["bun", "run", "web:test", "--", "--coverage"]);
  });

  test("web Vitest coverage uses v8 provider and 80 percent lines", () => {
    const pkg = JSON.parse(readFileSync("apps/web/package.json", "utf8")) as {
      devDependencies?: Record<string, string>;
    };
    const config = readFileSync("apps/web/vitest.config.ts", "utf8");

    expect(pkg.devDependencies?.["@vitest/coverage-v8"]).toBe("^4.1.5");
    expect(config).toContain('provider: "v8"');
    expect(config).toContain("lines: 80");
  });
});
