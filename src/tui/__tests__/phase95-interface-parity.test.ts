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
  const persistenceImportPattern = new RegExp([
    "@mikro-orm/postgresql",
    "db/db.module",
    ["db", "entities"].join("/"),
    ["product", "kernel"].join("-"),
  ].join("|").replaceAll("/", "\\/"));
  const directRuntimeSymbolPattern = /EntityManager|MikroORM|ENTITY_MANAGER_TOKEN|registerDbBindings/;
  const directOrmCallPattern = /em\.(persist|flush|find|findOne|getRepository|create|transactional)/;

  test("runtime caller and telemetry setup do not import persistence internals", async () => {
    for (const file of RUNTIME_FILES) {
      const text = await source(file);

      expect(text).not.toMatch(persistenceImportPattern);
      expect(text).not.toMatch(directRuntimeSymbolPattern);
      expect(text).not.toMatch(directOrmCallPattern);
    }
  });

  test("TUI screens stay DTO-only and caller-backed", async () => {
    for (const file of SCREEN_FILES) {
      const text = await source(file);

      expect(text).not.toMatch(persistenceImportPattern);
      expect(text).not.toMatch(new RegExp([
        "EntityManager",
        "MikroORM",
        ["open", "Database"].join(""),
        ["get", "Product", "Db"].join(""),
        ["Product", "Db"].join(""),
        "legacyStore",
      ].join("|")));
      expect(text).not.toMatch(directOrmCallPattern);
    }
  });

  test("search screen delegates query interpretation to caller path", async () => {
    const text = await source("../screens/search.ts");

    expect(text).not.toContain("../../search/nl-filter.ts");
    expect(text).toMatch(/caller\.search\.query/);
  });
});
