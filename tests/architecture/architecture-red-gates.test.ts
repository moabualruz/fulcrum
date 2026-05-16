import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function read(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("architecture RED gates", () => {
  test("root CI includes root and web coverage gate stages", async () => {
    const ci = await read("scripts/ci.ts");

    expect(ci).toContain('name: "coverage:root"');
    expect(ci).toContain('name: "coverage:web"');
  });

  test("web Vitest enforces coverage.thresholds.lines at 80", async () => {
    const config = await read("apps/web/vitest.config.ts");

    expect(config).toContain("coverage:");
    expect(config).toContain("thresholds:");
    expect(config).toMatch(/lines:\s*80/);
  });

  test("root CI runs the web:a11y gate", async () => {
    const ci = await read("scripts/ci.ts");

    expect(ci).toContain("web:a11y");
  });

  test("root CI runs migration downgrade coverage", async () => {
    const ci = await read("scripts/ci.ts");

    expect(ci).toContain('name: "migration:downgrade"');
    expect(ci).toContain("tests/db/migration-downgrade.test.ts");
  });

  test("root CI runs graceful shutdown coverage", async () => {
    const ci = await read("scripts/ci.ts");

    expect(ci).toContain('name: "graceful:shutdown"');
    expect(ci).toContain("tests/platform-core/platform-operations/shutdown-coordinator.test.ts");
  });
});
