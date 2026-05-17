// Tests for stripVendorRuleBlocks in install.ts.
// User content and Fulcrum sentinel blocks must be preserved.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVendorRuleBlocks } from "./install.ts";
import { replaceSentinelBlock } from "./vendor-rules.ts";

const BEGIN = "<!-- BEGIN FULCRUM RULES -->";
const END = "<!-- END FULCRUM RULES -->";
const FULCRUM_BODY = "## Fulcrum rules body\n\n- some rule\n";
const SENTINEL_BLOCK = `${BEGIN}\n${FULCRUM_BODY}\n${END}`;

async function writeTarget(dir: string, content: string): Promise<string> {
  const path = join(dir, "CLAUDE.md");
  await writeFile(path, content);
  return path;
}

describe("stripVendorRuleBlocks", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "vendor-rules-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("preserves files without known vendor blocks", async () => {
    const content = "# User Rules\n\nSome rule.\n\n# More content\n\nAnother rule.\n";
    const target = await writeTarget(testDir, content);

    await stripVendorRuleBlocks(target, false);

    expect(await readFile(target, "utf8")).toBe(content);
  });

  test("leaves the Fulcrum sentinel block untouched", async () => {
    const content =
      "# User content\n\nUser rule here.\n\n" +
      SENTINEL_BLOCK +
      "\n\n# After sentinel\n\nMore user content.\n";
    const target = await writeTarget(testDir, content);

    await stripVendorRuleBlocks(target, false);

    const result = await readFile(target, "utf8");
    expect(result).toContain(BEGIN);
    expect(result).toContain(END);
    expect(result).toContain(FULCRUM_BODY);
    expect(result).toContain("# User content");
    expect(result).toContain("# After sentinel");
  });

  test("dry-run mode does not modify the file", async () => {
    const content = "# User content\n\nUser rule.\n";
    const target = await writeTarget(testDir, content);

    await stripVendorRuleBlocks(target, true);

    expect(await readFile(target, "utf8")).toBe(content);
  });

  test("is a no-op when the target file does not exist", async () => {
    const missing = join(testDir, "nonexistent.md");
    await expect(stripVendorRuleBlocks(missing, false)).resolves.toBeUndefined();
  });

  test("replaceSentinelBlock preserves bytes outside Fulcrum sentinel markers", () => {
    const content = [
      "# User Rules",
      "",
      "Keep before.",
      "",
      SENTINEL_BLOCK,
      "",
      "# After",
      "",
      "Keep after.",
      "",
    ].join("\n");

    expect(replaceSentinelBlock(content, "## New Fulcrum body\n\n- updated")).toBe([
      "# User Rules",
      "",
      "Keep before.",
      "",
      BEGIN,
      "## New Fulcrum body",
      "",
      "- updated",
      END,
      "",
      "# After",
      "",
      "Keep after.",
      "",
    ].join("\n"));
  });

  test("creates parent directories for fixture writes", async () => {
    const nested = join(testDir, "nested");
    await mkdir(nested, { recursive: true });
    const target = await writeTarget(nested, "# User Rules\n");

    expect(await readFile(target, "utf8")).toBe("# User Rules\n");
  });
});
