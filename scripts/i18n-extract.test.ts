import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";

import { checkI18nCatalog } from "./i18n-extract.ts";

describe("i18n extraction gate", () => {
  test("passes when t keys match en catalog", async () => {
    const root = await mkdtemp(join(tmpdir(), "fulcrum-i18n-ok-"));
    try {
      await writeFile(join(root, "component.ts"), `t("common.save");\n`);
      await writeFile(join(root, "en.json"), JSON.stringify({ common: { save: "Save" } }));

      const result = await checkI18nCatalog({ roots: [root], catalogPath: join(root, "en.json") });

      expect(result.ok).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.extra).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fails on missing and orphaned keys", async () => {
    const root = await mkdtemp(join(tmpdir(), "fulcrum-i18n-bad-"));
    try {
      await writeFile(join(root, "component.ts"), `t("common.save");\nt('tasks.dueDate');\n`);
      await writeFile(join(root, "en.json"), JSON.stringify({ common: { save: "Save", cancel: "Cancel" } }));

      const result = await checkI18nCatalog({ roots: [root], catalogPath: join(root, "en.json") });

      expect(result.ok).toBe(false);
      expect(result.missing).toEqual(["tasks.dueDate"]);
      expect(result.extra).toEqual(["common.cancel"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
