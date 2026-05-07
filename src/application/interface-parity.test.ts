import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const PLAN_39_TEST_FILES = [
  "src/application/tasks/interface-parity.test.ts",
  "src/application/sprints/interface-parity.test.ts",
  "src/application/runs/interface-parity.test.ts",
  "src/application/artifacts/interface-parity.test.ts",
  "src/application/settings/interface-parity.test.ts",
  "src/application/search/interface-parity.test.ts",
  "src/api/__tests__/phase95-interface-parity.test.ts",
  "src/cli/application-parity.test.ts",
  "src/tui/__tests__/phase95-interface-parity.test.ts",
  "src/web/tests/e2e/phase95-cross-interface-parity.spec.ts",
] as const;

describe("Phase 09.5 aggregate interface parity proof", () => {
  test("every owned parity proof asserts application-created or indexed data by stable id", () => {
    for (const file of PLAN_39_TEST_FILES) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must assert stable IDs`).toMatch(/created\.id|entityId|project\.id|seed[A-Za-z]+\(/);
      expect(source, `${file} must not accept empty-array stubs`).not.toMatch(/toEqual\(\[\]\)|return\s+\[\]/);
    }
  });

  test("web parity spec has no skip helper or skipped critical checks", () => {
    const source = readFileSync("src/web/tests/e2e/phase95-cross-interface-parity.spec.ts", "utf8");
    expect(source).not.toContain("gotoOrSkip");
    expect(source).not.toMatch(/\btest\.skip\b|\.skip\(/);
    expect(source).toMatch(/response\?\.ok\(\)/);
  });
});
