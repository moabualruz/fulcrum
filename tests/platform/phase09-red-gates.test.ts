import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function read(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("Phase 09 RED gates", () => {
  test("root CI includes a coverage gate stage named coverage", async () => {
    const ci = await read("scripts/ci.ts");

    expect(ci).toContain('name: "coverage"');
  });

  test("web Vitest enforces coverage.thresholds.lines at 80", async () => {
    const config = await read("src/web/vitest.config.ts");

    expect(config).toContain("coverage.thresholds.lines");
    expect(config).toMatch(/lines:\s*80/);
  });

  test("root CI runs the web:a11y gate", async () => {
    const ci = await read("scripts/ci.ts");

    expect(ci).toContain("web:a11y");
  });

  test("root CI runs migration downgrade coverage", async () => {
    const ci = await read("scripts/ci.ts");

    expect(ci.toLowerCase()).toContain("migration downgrade");
  });

  test("root CI runs graceful shutdown coverage", async () => {
    const ci = await read("scripts/ci.ts");

    expect(ci.toLowerCase()).toContain("graceful shutdown");
  });
});
