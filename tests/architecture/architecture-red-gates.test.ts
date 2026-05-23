import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function read(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("architecture RED gates", () => {
  test("root CI has 5 tiers: lint+arch, unit, integration, design E2E, real E2E", async () => {
    const ci = await read("scripts/ci.ts");

    expect(ci).toContain('tier: "tier1"');
    expect(ci).toContain('tier: "tier2"');
    expect(ci).toContain('tier: "tier3"');
    expect(ci).toContain('tier: "tier4"');
    expect(ci).toContain('tier: "tier5"');
  });

  test("web Vitest enforces coverage.thresholds.lines at 80", async () => {
    const config = await read("apps/web/vitest.config.ts");

    expect(config).toContain("coverage:");
    expect(config).toContain("thresholds:");
    expect(config).toMatch(/lines:\s*80/);
  });

  test("root CI architecture stage runs tests/architecture/", async () => {
    const ci = await read("scripts/ci.ts");

    expect(ci).toContain('name: "architecture"');
    expect(ci).toContain("tests/architecture/");
  });

  test("root CI unit stage runs services/", async () => {
    const ci = await read("scripts/ci.ts");

    expect(ci).toContain('name: "unit"');
    expect(ci).toContain("services/");
  });

  test("root CI integration stage runs tests/", async () => {
    const ci = await read("scripts/ci.ts");

    expect(ci).toContain('name: "integration"');
    expect(ci).toContain("tests/");
  });
});
