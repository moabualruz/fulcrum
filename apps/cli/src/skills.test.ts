// Tests for `fulcrum skills sync` Claude Code plugin install branch.
// Uses dry-run + tempdir HOME; never writes outside the tempdir or invokes
// the real `claude` CLI (dry-run short-circuits subprocess execution).

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { removeAuthoredSkills, syncSkills } from "./skills.ts";
import * as proc from "@platform-core/application/runtime-support/process-runner.ts";

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
    process.env["FULCRUM_REPO_DIR"] = join(__dirname, "../../..");
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

describe("skills sync — Codex scope and runtime HOME", () => {
  let testHome: string;
  let origHome: string | undefined;
  let origRepoDir: string | undefined;

  beforeEach(async () => {
    testHome = await mkdtemp(join(tmpdir(), "fulcrum-skills-scope-"));
    origHome = process.env["HOME"];
    origRepoDir = process.env["FULCRUM_REPO_DIR"];
    process.env["HOME"] = testHome;
    process.env["FULCRUM_REPO_DIR"] = join(__dirname, "../../..");
  });

  afterEach(async () => {
    if (origHome !== undefined) process.env["HOME"] = origHome;
    else delete process.env["HOME"];
    if (origRepoDir !== undefined) process.env["FULCRUM_REPO_DIR"] = origRepoDir;
    else delete process.env["FULCRUM_REPO_DIR"];
    await rm(testHome, { recursive: true, force: true });
  });

  test("default dry-run does not target global ~/.codex/skills/fulcrum", async () => {
    await mkdir(join(testHome, ".codex"), { recursive: true });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      logs.push(String(a[0]));
    });
    try {
      await syncSkills({ dryRun: true });
    } finally {
      logSpy.mockRestore();
    }

    expect(logs.join("\n")).not.toContain(join(testHome, ".codex", "skills", "fulcrum"));
    expect(logs.some((l) => l.includes("skip Codex CLI global skills"))).toBe(true);
  });

  test("explicit global Codex scope targets ~/.codex/skills/fulcrum", async () => {
    await mkdir(join(testHome, ".codex"), { recursive: true });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      logs.push(String(a[0]));
    });
    try {
      await syncSkills({ dryRun: true, codexScope: "global" });
    } finally {
      logSpy.mockRestore();
    }

    expect(logs.join("\n")).toContain(join(testHome, ".codex", "skills", "fulcrum"));
  });

  test("explicit global Codex sync does not plan a namespace-wide prune", async () => {
    await mkdir(join(testHome, ".codex"), { recursive: true });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      logs.push(String(a[0]));
    });
    try {
      await syncSkills({ dryRun: true, codexScope: "global" });
    } finally {
      logSpy.mockRestore();
    }

    const output = logs.join("\n");
    expect(output).toContain(join(testHome, ".codex", "skills", "fulcrum"));
    expect(output).not.toContain("would prune");
  });

  test("project Codex scope targets project-local .codex/skills/fulcrum", async () => {
    const projectDir = join(testHome, "consumer-repo");
    await mkdir(projectDir, { recursive: true });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      logs.push(String(a[0]));
    });
    try {
      await syncSkills({ dryRun: true, codexScope: "project", projectDir });
    } finally {
      logSpy.mockRestore();
    }

    expect(logs.join("\n")).toContain(join(projectDir, ".codex", "skills", "fulcrum"));
    expect(logs.join("\n")).not.toContain(join(testHome, ".codex", "skills", "fulcrum"));
  });

  test("all dry-run targets use runtime HOME after import", async () => {
    await mkdir(join(testHome, ".codex"), { recursive: true });
    await mkdir(join(testHome, ".config", "opencode"), { recursive: true });
    await mkdir(join(testHome, ".pi", "agent"), { recursive: true });
    await mkdir(join(testHome, ".gemini"), { recursive: true });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      logs.push(String(a[0]));
    });
    try {
      await syncSkills({ dryRun: true, codexScope: "global" });
    } finally {
      logSpy.mockRestore();
    }
    const output = logs.join("\n");

    expect(output).toContain(join(testHome, ".codex", "skills", "fulcrum"));
    expect(output).toContain(join(testHome, ".config", "opencode", "skills", "fulcrum"));
    expect(output).toContain(join(testHome, ".pi", "agent", "skills", "fulcrum"));
    expect(output).toContain(join(testHome, ".gemini", "extensions", "fulcrum-skills"));
    if (origHome) expect(output).not.toContain(join(origHome, ".codex", "skills", "fulcrum"));
  });
});

describe("Claude Code plugin package", () => {
  const root = join(__dirname, "../../..");

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

  test("refresh prunes stale plugin cache files and excludes source backups from generated folders", async () => {
    const testHome = await mkdtemp(join(tmpdir(), "fulcrum-plugin-refresh-"));
    const origHome = process.env["HOME"];
    const origRepoDir = process.env["FULCRUM_REPO_DIR"];
    try {
      process.env["HOME"] = testHome;
      process.env["FULCRUM_REPO_DIR"] = root;
      const stale = join(
        testHome,
        ".claude",
        "plugins",
        "cache",
        "fulcrum",
        "fulcrum",
        "0.1.0",
        "skills",
        "stale",
        "SKILL.md",
      );
      await mkdir(join(stale, ".."), { recursive: true });
      await writeFile(stale, "---\nname: stale\n---\n");
      await mkdir(join(testHome, ".claude", "plugins"), { recursive: true });
      await writeFile(
        join(testHome, ".claude", "plugins", "installed_plugins.json"),
        JSON.stringify({ version: 2, plugins: { "fulcrum@fulcrum": [{ scope: "user" }] } }),
      );
      const marketplaceBackup = join(testHome, ".claude", "plugins", "marketplaces", "fulcrum", "docs", "guide.original.md");
      const cacheBackup = join(testHome, ".claude", "plugins", "cache", "fulcrum", "old.original.md");
      await mkdir(join(marketplaceBackup, ".."), { recursive: true });
      await mkdir(join(cacheBackup, ".."), { recursive: true });
      await writeFile(marketplaceBackup, "backup");
      await writeFile(cacheBackup, "backup");

      await syncSkills({ dryRun: false });

      expect(await Bun.file(stale).exists()).toBe(false);
      expect(await Bun.file(marketplaceBackup).exists()).toBe(false);
      expect(await Bun.file(cacheBackup).exists()).toBe(false);
      const generatedRoots = [
        join(testHome, ".claude", "plugins", "cache", "fulcrum", "fulcrum", "0.1.0", "skills"),
        join(testHome, ".claude", "plugins", "marketplaces", "fulcrum", "plugins", "fulcrum", "skills"),
      ];
      for (const generatedRoot of generatedRoots) {
        const files = await collectRelativeFiles(generatedRoot);
        const banned = files.filter((file) =>
          file.endsWith(".original.md") ||
          file.includes("/_archive/") ||
          file.includes("/_template/") ||
          file.includes("/.claude/") ||
          file.includes("/.git/") ||
          file.includes("/node_modules/")
        );
        expect(banned).toEqual([]);
        for (const file of files) {
          const source = join(root, "skills", file);
          expect(await readFile(join(generatedRoot, file), "utf8")).toEqual(await readFile(source, "utf8"));
        }
      }
    } finally {
      if (origHome !== undefined) process.env["HOME"] = origHome;
      else delete process.env["HOME"];
      if (origRepoDir !== undefined) process.env["FULCRUM_REPO_DIR"] = origRepoDir;
      else delete process.env["FULCRUM_REPO_DIR"];
      await rm(testHome, { recursive: true, force: true });
    }
  });
});

async function collectRelativeFiles(root: string, dir = root): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await collectRelativeFiles(root, path));
    } else {
      out.push(path.slice(root.length + 1));
    }
  }
  return out.sort();
}

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
    const claudePluginCache = join(testHome, ".claude", "plugins", "cache", "fulcrum", "fulcrum", "0.1.0");
    const claudeMarketplaceCache = join(testHome, ".claude", "plugins", "marketplaces", "fulcrum");
    await mkdir(claudePluginCache, { recursive: true });
    await mkdir(claudeMarketplaceCache, { recursive: true });
    await writeFile(join(claudePluginCache, "plugin.json"), "{}\n");
    await writeFile(join(claudeMarketplaceCache, "marketplace.json"), "{}\n");

    try {
      await removeAuthoredSkills();

      for (const parts of authoredDirs) {
        await expect(readdir(join(testHome, ...parts))).rejects.toThrow();
      }
      for (const parts of vendorDirs) {
        expect(await readFile(join(testHome, ...parts, "SKILL.md"), "utf8")).toContain("name: test");
      }
      expect(await Bun.file(claudePluginCache).exists()).toBe(false);
      expect(await Bun.file(claudeMarketplaceCache).exists()).toBe(false);
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

describe("skills list --installed", () => {
  test("prints installed skill budget from active Codex roots", async () => {
    const testHome = await mkdtemp(join(tmpdir(), "fulcrum-skills-installed-"));
    try {
      await mkdir(join(testHome, ".codex", "skills", "alpha"), { recursive: true });
      await writeFile(
        join(testHome, ".codex", "skills", "alpha", "SKILL.md"),
        "---\nname: alpha\ndescription: Alpha installed skill\n---\n",
      );
      const proc = Bun.spawn(["bun", "apps/cli/src/main.ts", "skills", "list", "--installed"], {
        cwd: join(__dirname, "../../.."),
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, HOME: testHome },
      });
      const out = await new Response(proc.stdout).text();
      const err = await new Response(proc.stderr).text();
      const exit = await proc.exited;

      expect(exit).toBe(0);
      expect(err).toBe("");
      expect(out).toContain("Installed skill metadata budget");
      expect(out).toContain("Codex CLI: 1 skills");
      expect(out).toContain(join(testHome, ".codex", "skills"));
    } finally {
      await rm(testHome, { recursive: true, force: true });
    }
  });
});
