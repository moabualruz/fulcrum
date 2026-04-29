// Tests for `fulcrum skills sync` Claude Code plugin install branch.
// Uses dry-run + tempdir HOME; never writes outside the tempdir or invokes
// the real `claude` CLI (dry-run short-circuits subprocess execution).

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { syncSkills } from "./skills.ts";

describe("skills sync — Claude Code plugin path", () => {
  let testHome: string;
  let origHome: string | undefined;
  let origRepoDir: string | undefined;

  beforeEach(async () => {
    testHome = await mkdtemp(join(tmpdir(), "fulcrum-skills-claude-"));
    origHome = process.env["HOME"];
    origRepoDir = process.env["FULCRUM_REPO_DIR"];
    process.env["HOME"] = testHome;
    // Point to real repo root so curated skills/<name>/SKILL.md exists.
    process.env["FULCRUM_REPO_DIR"] = join(__dirname, "../..");
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env["HOME"] = origHome;
    else delete process.env["HOME"];
    if (origRepoDir !== undefined) process.env["FULCRUM_REPO_DIR"] = origRepoDir;
    else delete process.env["FULCRUM_REPO_DIR"];
    await rm(testHome, { recursive: true, force: true });
  });

  test("dry-run: when ~/.claude exists, logs marketplace add + plugin install commands", async () => {
    await mkdir(join(testHome, ".claude"), { recursive: true });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      logs.push(String(a[0]));
    });
    try {
      await syncSkills({ dryRun: true });
      const hasMarketplace = logs.some((l) =>
        l.includes("claude plugin marketplace add") && l.includes("moabualruz/fulcrum")
      );
      const hasInstall = logs.some((l) =>
        l.includes("claude plugin install") && l.includes("fulcrum@fulcrum")
      );
      const hasHeader = logs.some((l) => l.includes("Claude Code (plugin:"));
      expect(hasHeader).toBe(true);
      expect(hasMarketplace).toBe(true);
      expect(hasInstall).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  test("dry-run: skip when fulcrum@fulcrum already in installed_plugins.json", async () => {
    const claudeDir = join(testHome, ".claude");
    await mkdir(join(claudeDir, "plugins"), { recursive: true });
    await writeFile(
      join(claudeDir, "plugins", "installed_plugins.json"),
      JSON.stringify({ version: 2, plugins: { "fulcrum@fulcrum": [{ scope: "user" }] } }),
    );
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      logs.push(String(a[0]));
    });
    try {
      await syncSkills({ dryRun: true });
      expect(logs.some((l) => l.includes("already installed"))).toBe(true);
      // Must NOT propose marketplace add when already installed.
      expect(logs.some((l) => l.includes("would run: claude plugin marketplace add"))).toBe(false);
    } finally {
      logSpy.mockRestore();
    }
  });

  test("dry-run: legacy ~/.claude/skills/fulcrum/* cleanup logged", async () => {
    const legacyDir = join(testHome, ".claude", "skills", "fulcrum", "stale-skill");
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, "SKILL.md"), "---\nname: stale-skill\n---\n");
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      logs.push(String(a[0]));
    });
    try {
      await syncSkills({ dryRun: true });
      expect(logs.some((l) =>
        l.includes("would remove legacy layout") && l.includes("/.claude/skills/fulcrum")
      )).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  test("when ~/.claude absent, Claude Code branch is skipped", async () => {
    // No ~/.claude in testHome.
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      logs.push(String(a[0]));
    });
    try {
      await syncSkills({ dryRun: true });
      expect(logs.some((l) => l.includes("skip Claude Code"))).toBe(true);
      expect(logs.some((l) => l.includes("Claude Code (plugin:"))).toBe(false);
    } finally {
      logSpy.mockRestore();
    }
  });
});
