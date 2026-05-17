import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { readSkillContent } from "./loader.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-skill-loader-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("readSkillContent", () => {
  test("returns SKILL.md content for valid slug", async () => {
    const skillDir = join(scratch, "skills", "tdd");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "# TDD skill\nRed-green-refactor.");

    const content = await readSkillContent("tdd", "org1", scratch);
    expect(content).toBe("# TDD skill\nRed-green-refactor.");
  });

  test("returns null for missing slug and logs warning", async () => {
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };
    try {
      const content = await readSkillContent("nonexistent", "org1", scratch);
      expect(content).toBeNull();
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain("nonexistent");
    } finally {
      console.warn = origWarn;
    }
  });

  test("returns null for slug with no SKILL.md file", async () => {
    const skillDir = join(scratch, "skills", "empty-dir");
    mkdirSync(skillDir, { recursive: true });

    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };
    try {
      const content = await readSkillContent("empty-dir", "org1", scratch);
      expect(content).toBeNull();
      expect(warnings.length).toBe(1);
    } finally {
      console.warn = origWarn;
    }
  });
});
