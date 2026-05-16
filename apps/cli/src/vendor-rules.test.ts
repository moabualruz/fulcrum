// Tests for stripVendorRuleBlocks in install.ts.
// user content is preserved, and the function is idempotent.

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stripVendorRuleBlocks } from "./install.ts";
import { replaceSentinelBlock } from "./vendor-rules.ts";

const BEGIN = "<!-- BEGIN FULCRUM RULES -->";
const END = "<!-- END FULCRUM RULES -->";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function writeTarget(dir: string, content: string): Promise<string> {
  const p = join(dir, "CLAUDE.md");
  await writeFile(p, content);
  return p;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FULCRUM_BODY = "## Fulcrum rules body\n\n- some rule\n";

const SENTINEL_BLOCK = `${BEGIN}\n${FULCRUM_BODY}\n${END}`;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("stripVendorRuleBlocks", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "vendor-rules-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

    const target = await writeTarget(testDir, content);

    await stripVendorRuleBlocks(target, false);

    const result = await readFile(target, "utf8");
    // Other content must be preserved.
    expect(result).toContain("# Other content");
    expect(result).toContain("Some user rule.");
  });

    const content =
      "# My Project Rules\n\nUser rule A.\n\n" +
      "\n# Another Section\n\nUser rule B.\n";
    const target = await writeTarget(testDir, content);

    await stripVendorRuleBlocks(target, false);

    const result = await readFile(target, "utf8");
    expect(result).toContain("My Project Rules");
    expect(result).toContain("User rule A.");
    expect(result).toContain("# Another Section");
    expect(result).toContain("User rule B.");
  });

    // The guard only matches EXACT headings in VENDOR_RULE_HEADINGS.
    const content =
      "# Other Section\n\nUser rule.\n";
    const target = await writeTarget(testDir, content);

    await stripVendorRuleBlocks(target, false);

    const result = await readFile(target, "utf8");
    // The custom heading must NOT be stripped.
    expect(result).toContain("# Other Section");
  });

  // ── 4. Leave the FULCRUM sentinel block untouched ──────────────────────

  test("leaves the FULCRUM RULES sentinel block untouched", async () => {
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
  });

      `${BEGIN}\n` +
      `${FULCRUM_BODY}` +
      `\n## 12. Vendor-tool behavioral rules\n\n` +
      `\n${END}`;
    const content =
      "# User content\n\nUser rule.\n\n" +
      "\n";
    const target = await writeTarget(testDir, content);

    await stripVendorRuleBlocks(target, false);

    const result = await readFile(target, "utf8");
    // Content inside sentinel must be intact.
    expect(result).toContain("## 12. Vendor-tool behavioral rules");
    expect(result).toContain(BEGIN);
    expect(result).toContain(END);
  });

  // ── 6. Idempotency: running twice produces same result ─────────────────

  test("is idempotent: second call on already-stripped file is a no-op", async () => {
    const target = await writeTarget(testDir, content);

    await stripVendorRuleBlocks(target, false);
    const afterFirst = await readFile(target, "utf8");

    await stripVendorRuleBlocks(target, false);
    const afterSecond = await readFile(target, "utf8");

    expect(afterSecond).toBe(afterFirst);
  });

  // ── 7. Dry-run: does not modify file ──────────────────────────────────

  test("dry-run mode does not modify the file", async () => {
    const target = await writeTarget(testDir, content);

    await stripVendorRuleBlocks(target, true);

    const result = await readFile(target, "utf8");
    // File must be unchanged.
    expect(result).toBe(content);
  });

  // ── 8. No-op when file does not exist ─────────────────────────────────

  test("is a no-op when the target file does not exist", async () => {
    const missing = join(testDir, "nonexistent.md");
    // Must not throw.
    await expect(stripVendorRuleBlocks(missing, false)).resolves.toBeUndefined();
  });

  test("strips vendor block before sentinel but not inside sentinel", async () => {
    const content =
      "\n# User heading\n\nUser content.\n\n" +
      SENTINEL_BLOCK +
      "\n";
    const target = await writeTarget(testDir, content);

    await stripVendorRuleBlocks(target, false);

    const result = await readFile(target, "utf8");
    expect(result).toContain("# User heading");
    expect(result).toContain(BEGIN);
    expect(result).toContain(END);
  });

  // ── 10. File without any vendor block: unchanged ───────────────────────

  test("does not modify a file with no vendor blocks", async () => {
    const content =
      "# User Rules\n\nSome rule.\n\n" +
      SENTINEL_BLOCK +
      "\n\n# More content\n\nAnother rule.\n";
    const target = await writeTarget(testDir, content);

    await stripVendorRuleBlocks(target, false);

    const result = await readFile(target, "utf8");
    expect(result).toBe(content);
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
});
