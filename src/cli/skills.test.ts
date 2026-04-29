// Tests for `fulcrum skills sync` Claude Code plugin install branch.
// Uses dry-run + tempdir HOME; never writes outside the tempdir or invokes
// the real `claude` CLI (dry-run short-circuits subprocess execution).

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { removeAuthoredSkills, syncSkills } from "./skills.ts";
import * as proc from "../utils/proc.ts";

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

describe("Claude Code plugin package", () => {
  const root = join(__dirname, "../..");

  test("marketplace points at clean plugin package, not repo root", async () => {
    const marketplace = JSON.parse(
      await readFile(join(root, ".claude-plugin", "marketplace.json"), "utf8"),
    );
    expect(marketplace.plugins[0].source).toBe("./plugins/fulcrum");
  });

  test("package contains exactly authored skills, excluding templates and archive", async () => {
    const authoredRoot = join(root, "skills");
    const packageRoot = join(root, "plugins", "fulcrum", "skills");
    const skillNames = async (dir: string): Promise<string[]> => {
      const names: string[] = [];
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name === "_template" || entry.name === "_archive") continue;
        try {
          await readFile(join(dir, entry.name, "SKILL.md"), "utf8");
          names.push(entry.name);
        } catch { /* not a skill */ }
      }
      return names.sort();
    };

    const authored = await skillNames(authoredRoot);
    const packaged = await skillNames(packageRoot);
    expect(packaged).toEqual(authored);
    expect(packaged).not.toContain("_template");
    expect(packaged).not.toContain("_archive");
  });
});

describe("removeAuthoredSkills", () => {
  let testHome: string;
  let origHome: string | undefined;

  beforeEach(async () => {
    testHome = await mkdtemp(join(tmpdir(), "fulcrum-skills-remove-"));
    origHome = process.env["HOME"];
    process.env["HOME"] = testHome;
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env["HOME"] = origHome;
    else delete process.env["HOME"];
    await rm(testHome, { recursive: true, force: true });
  });

  test("removes Fulcrum-authored namespaces and preserves vendor skill placements", async () => {
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const authoredDirs = [
      [".claude", "skills", "fulcrum", "bat"],
      [".codex", "skills", "fulcrum", "bat"],
      [".config", "opencode", "skills", "fulcrum", "bat"],
      [".pi", "agent", "skills", "fulcrum", "bat"],
      [".gemini", "extensions", "fulcrum-skills", "skills", "bat"],
    ];
    const vendorDirs = [
      [".claude", "skills", "wrangler"],
      [".codex", "skills", "wrangler"],
      [".config", "opencode", "skills", "wrangler"],
      [".pi", "agent", "skills", "wrangler"],
      [".gemini", "skills", "wrangler"],
    ];

    for (const parts of [...authoredDirs, ...vendorDirs]) {
      await mkdir(join(testHome, ...parts), { recursive: true });
      await writeFile(join(testHome, ...parts, "SKILL.md"), "---\nname: test\n---\n");
    }

    try {
      await removeAuthoredSkills();

      for (const parts of authoredDirs) {
        await expect(readdir(join(testHome, ...parts))).rejects.toThrow();
      }
      for (const parts of vendorDirs) {
        expect(await readFile(join(testHome, ...parts, "SKILL.md"), "utf8")).toContain("name: test");
      }
    } finally {
      whichSpy.mockRestore();
    }
  });

  test("dry-run logs removals without deleting authored namespace", async () => {
    const authored = join(testHome, ".codex", "skills", "fulcrum", "bat");
    await mkdir(authored, { recursive: true });
    await writeFile(join(authored, "SKILL.md"), "---\nname: bat\n---\n");

    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      logs.push(String(a[0]));
    });
    try {
      await removeAuthoredSkills({ dryRun: true });
    } finally {
      logSpy.mockRestore();
    }

    expect(await readFile(join(authored, "SKILL.md"), "utf8")).toContain("name: bat");
    expect(logs.some((l) => l.includes("[dry-run] would remove") && l.includes("/.codex/skills/fulcrum"))).toBe(true);
  });
});
