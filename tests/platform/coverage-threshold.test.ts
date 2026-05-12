import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { STEPS } from "../../scripts/ci.ts";
import { coverageStats, mergeLcov, renderMergedLcov } from "../../scripts/test-root-coverage.ts";

describe("Phase 09 coverage threshold gates", () => {
  test("root coverage merge excludes test files from implementation coverage stats", () => {
    const coverage = new Map();

    mergeLcov(coverage, [
      "TN:",
      "SF:src/real.ts",
      "DA:1,1",
      "DA:2,0",
      "end_of_record",
      "TN:",
      "SF:tests/real.test.ts",
      "DA:1,1",
      "DA:2,1",
      "DA:3,1",
      "end_of_record",
      "TN:",
      "SF:src/real.spec.ts",
      "DA:1,1",
      "end_of_record",
      "",
    ].join("\n"));

    expect([...coverage.keys()]).toEqual(["src/real.ts"]);
    expect(coverageStats(coverage)).toEqual({ covered: 1, total: 2, ratio: 0.5 });
    expect(renderMergedLcov(coverage)).toContain("SF:src/real.ts");
    expect(renderMergedLcov(coverage)).not.toContain("tests/real.test.ts");
    expect(renderMergedLcov(coverage)).not.toContain("src/real.spec.ts");
  });

  test("root coverage merge excludes TypeScript and multiline literal noise, not runtime code", () => {
    const scratch = mkdtempSync(join(tmpdir(), "fulcrum-coverage-"));
    try {
      const sourcePath = join(scratch, "runtime.ts");
      writeFileSync(sourcePath, [
        "export interface Row {",
        "  id: string;",
        "}",
        "",
        "export function query(id: string): string {",
        "  const sql = `",
        "    SELECT id",
        "    FROM rows",
        "  `;",
        "  return `${sql}:${id}`;",
        "}",
        "",
      ].join("\n"));

      const coverage = new Map();
      mergeLcov(coverage, [
        "TN:",
        `SF:${sourcePath}`,
        "DA:1,0",
        "DA:2,0",
        "DA:3,0",
        "DA:4,0",
        "DA:5,1",
        "DA:6,1",
        "DA:7,0",
        "DA:8,0",
        "DA:9,0",
        "DA:10,1",
        "DA:11,0",
        "end_of_record",
        "",
      ].join("\n"));

      expect(coverage.get(sourcePath)).toEqual(new Map([
        [5, 1],
        [6, 1],
        [10, 1],
        [11, 0],
      ]));
      expect(coverageStats(coverage)).toEqual({ covered: 3, total: 4, ratio: 0.75 });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("root Bun coverage config declares target coverage and root runner enforces an honest ratchet", () => {
    const bunfig = readFileSync("bunfig.toml", "utf8");
    const source = readFileSync("scripts/test-root.ts", "utf8");

    expect(bunfig).toContain("coverageThreshold");
    expect(bunfig).toContain("0.80");
    expect(source).toContain("FULCRUM_ROOT_TEST_COVERAGE_THRESHOLD");
    expect(source).toContain('?? "0.80"');
    expect(source).toContain("exitCode = 99");
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
