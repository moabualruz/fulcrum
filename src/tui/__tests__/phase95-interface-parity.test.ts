import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const RUNTIME_FILES = [
  "../index.ts",
  "../telemetry.ts",
] as const;

const SCREEN_FILES = [
  "../screens/settings-screens.ts",
  "../screens/routing-rules.ts",
  "../screens/search.ts",
  "../screens/skills.ts",
  "../screens/sprints.ts",
  "../screens/settings.ts",
] as const;

async function source(path: string): Promise<string> {
  return await readFile(new URL(path, import.meta.url), "utf-8");
}

describe("Phase 09.5 TUI interface encapsulation", () => {
  test("runtime caller and telemetry setup do not import persistence internals", async () => {
    for (const file of RUNTIME_FILES) {
      const text = await source(file);

      expect(text).not.toMatch(/@mikro-orm\/postgresql|db\/db\.module|db\/entities|product-kernel/);
      expect(text).not.toMatch(/EntityManager|MikroORM|Session|ENTITY_MANAGER_TOKEN|registerDbBindings/);
      expect(text).not.toMatch(/em\.(persist|flush|find|findOne|getRepository|create|transactional)/);
    }
  });

  test("TUI screens stay DTO-only and caller-backed", async () => {
    for (const file of SCREEN_FILES) {
      const text = await source(file);

      expect(text).not.toMatch(/@mikro-orm\/postgresql|db\/db\.module|db\/entities|db\/repositories|product-kernel/);
      expect(text).not.toMatch(/EntityManager|MikroORM|openDatabase|getProductDb|ProductDb|legacyStore/);
      expect(text).not.toMatch(/em\.(persist|flush|find|findOne|getRepository|create|transactional)/);
    }
  });

  test("search screen delegates query interpretation to caller path", async () => {
    const text = await source("../screens/search.ts");

    expect(text).not.toContain("../../search/nl-filter.ts");
    expect(text).toMatch(/caller\.search\.query/);
  });
});
