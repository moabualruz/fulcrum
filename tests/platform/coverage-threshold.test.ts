import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { STEPS } from "../../scripts/ci.ts";

describe("Phase 09 coverage threshold gates", () => {
  test("root test runner supports coverage without changing normal discovery", () => {
    const source = readFileSync("scripts/test-root.ts", "utf8");

    expect(source).toContain("--coverage");
    expect(source).toContain("coverageArgs");
    expect(source).toContain("bun");
    expect(source).toContain("test");
  });

  test("root Bun coverage config enforces 80 percent lines", () => {
    const bunfig = readFileSync("bunfig.toml", "utf8");

    expect(bunfig).toContain("coverageThreshold");
    expect(bunfig).toContain("0.80");
  });

  test("local CI contains root and web coverage gates", () => {
    const root = STEPS.find((step) => step.name === "coverage:root");
    const web = STEPS.find((step) => step.name === "coverage:web");

    expect(root?.cmd).toEqual(["bun", "run", "scripts/test-root.ts", "--coverage"]);
    expect(web?.cwd).toBe("src/web");
    expect(web?.cmd).toEqual(["bun", "run", "web:test", "--", "--coverage"]);
  });

  test("web Vitest coverage uses v8 provider and 80 percent lines", () => {
    const pkg = JSON.parse(readFileSync("src/web/package.json", "utf8")) as {
      devDependencies?: Record<string, string>;
    };
    const config = readFileSync("src/web/vitest.config.ts", "utf8");

    expect(pkg.devDependencies?.["@vitest/coverage-v8"]).toBe("^4.1.5");
    expect(config).toContain('provider: "v8"');
    expect(config).toContain("lines: 80");
  });
});
