import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { assembleSkillContext } from "./assemble.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-ctx-assemble-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function seedSkill(slug: string, content: string): void {
  const dir = join(scratch, "skills", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), content);
}

describe("assembleSkillContext", () => {
  test("routing rule with action_skill_set ['tdd'] includes SKILL.md content", async () => {
    seedSkill("tdd", "# TDD\nRed-green-refactor loop.");

    const bundle = await assembleSkillContext({
      skillSlugs: ["tdd"],
      orgId: "org1",
      repoRoot: scratch,
    });

    expect(bundle.sections.length).toBe(1);
    expect(bundle.sections[0]!.heading).toBe("Skill: tdd");
    expect(bundle.sections[0]!.body).toContain("Red-green-refactor");
  });

  test("multiple skills included in order", async () => {
    seedSkill("caveman", "# Caveman\nUltra mode.");

    const bundle = await assembleSkillContext({
      skillSlugs: ["tdd", "caveman"],
      orgId: "org1",
      repoRoot: scratch,
    });

    expect(bundle.sections.length).toBe(2);
    expect(bundle.sections[0]!.heading).toBe("Skill: tdd");
    expect(bundle.sections[1]!.heading).toBe("Skill: caveman");
  });

  test("missing slug logs warning, bundle has remaining skills", async () => {
    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };
    try {
      const bundle = await assembleSkillContext({
        skillSlugs: ["tdd", "does-not-exist"],
        orgId: "org1",
        repoRoot: scratch,
      });

      expect(bundle.sections.length).toBe(1);
      expect(bundle.sections[0]!.heading).toBe("Skill: tdd");
      expect(warnings.some((w) => w.includes("does-not-exist"))).toBe(true);
    } finally {
      console.warn = origWarn;
    }
  });

  test("empty action_skill_set produces empty bundle", async () => {
    const bundle = await assembleSkillContext({
      skillSlugs: [],
      orgId: "org1",
      repoRoot: scratch,
    });

    expect(bundle.sections.length).toBe(0);
    expect(bundle.rendered).toBe("");
  });

  test("token budget truncates skills proportionally", async () => {
    seedSkill("big-a", "x".repeat(5000));
    seedSkill("big-b", "y".repeat(5000));

    const bundle = await assembleSkillContext({
      skillSlugs: ["big-a", "big-b"],
      orgId: "org1",
      repoRoot: scratch,
      tokenBudget: 100, // ~100 tokens ≈ 400 chars
    });

    // rendered output should be capped
    expect(bundle.rendered.length).toBeLessThan(1000);
    expect(bundle.truncated).toBe(true);
  });
});
