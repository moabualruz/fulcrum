// Tests for caveman install logic in install.ts.
// Uses Bun test runner; no GitHub network access.

import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import { chmod, mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertNotAgentsPath, installCaveman, lockCavemanUltra, run as installRun, spliceSentinel, setDryRun } from "./install.ts";
import { auditPackageParity } from "./package-parity.ts";
import { planPackageMirrorTargets } from "./package-mirror.ts";
import { getPackageSurfaceManifest } from "./package-surfaces.ts";
import { run as runProc } from "../utils/proc.ts";
import * as proc from "../utils/proc.ts";

// ---------------------------------------------------------------------------
// 1. ~/.agents/ guard
// ---------------------------------------------------------------------------

describe("assertNotAgentsPath", () => {
  const home = "/home/testuser";

  test("throws for exact ~/.agents path", () => {
    expect(() => assertNotAgentsPath(`${home}/.agents`, home)).toThrow("HARD RULE VIOLATION");
  });

  test("throws for path inside ~/.agents/", () => {
    expect(() => assertNotAgentsPath(`${home}/.agents/skills/foo`, home)).toThrow("HARD RULE VIOLATION");
  });

  test("throws for nested path inside ~/.agents/", () => {
    expect(() => assertNotAgentsPath(`${home}/.agents/x/y/z`, home)).toThrow("HARD RULE VIOLATION");
  });

  test("does not throw for ~/.claude/skills", () => {
    expect(() => assertNotAgentsPath(`${home}/.claude/skills`, home)).not.toThrow();
  });

  test("does not throw for ~/.codex/skills", () => {
    expect(() => assertNotAgentsPath(`${home}/.codex/skills`, home)).not.toThrow();
  });

  test("does not throw for a path that merely contains 'agents' substring", () => {
    // e.g. ~/.agents-backup should not match the guard
    expect(() => assertNotAgentsPath(`${home}/.agents-backup/foo`, home)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. lockCavemanUltra
// ---------------------------------------------------------------------------

describe("lockCavemanUltra", () => {
  let testHome: string;

  beforeEach(async () => {
    testHome = await mkdtemp(join(tmpdir(), "caveman-ultra-"));
  });

  afterEach(async () => {
    await rm(testHome, { recursive: true, force: true });
  });

  test("fresh install: no existing config.json → writes defaultMode: ultra", async () => {
    await lockCavemanUltra(testHome);

    const cfgPath = join(testHome, ".config", "caveman", "config.json");
    const content = await readFile(cfgPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed.defaultMode).toBe("ultra");
  });

  test("existing defaultMode: ultra → no-op (file unchanged)", async () => {
    const cfgDir = join(testHome, ".config", "caveman");
    await mkdir(cfgDir, { recursive: true });
    const cfgPath = join(cfgDir, "config.json");
    const original = { defaultMode: "ultra" };
    await writeFile(cfgPath, JSON.stringify(original, null, 2) + "\n");

    // get original mtime
    const statBefore = await Bun.file(cfgPath).stat();
    const mtimeBefore = statBefore?.mtime?.getTime() ?? 0;

    // sleep briefly to ensure any mtime difference would be detectable
    await new Promise((r) => setTimeout(r, 10));

    // run lockCavemanUltra
    await lockCavemanUltra(testHome);

    // verify file unchanged (mtime should not increase)
    const statAfter = await Bun.file(cfgPath).stat();
    const mtimeAfter = statAfter?.mtime?.getTime() ?? 0;
    expect(mtimeAfter).toBe(mtimeBefore);

    // verify content still correct
    const content = await readFile(cfgPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed.defaultMode).toBe("ultra");
  });

  test("existing defaultMode: full → overwritten to ultra", async () => {
    const cfgDir = join(testHome, ".config", "caveman");
    await mkdir(cfgDir, { recursive: true });
    const cfgPath = join(cfgDir, "config.json");
    await writeFile(cfgPath, JSON.stringify({ defaultMode: "full" }, null, 2) + "\n");

    await lockCavemanUltra(testHome);

    const content = await readFile(cfgPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed.defaultMode).toBe("ultra");
  });

  test("existing malformed JSON → overwritten to ultra (no throw)", async () => {
    const cfgDir = join(testHome, ".config", "caveman");
    await mkdir(cfgDir, { recursive: true });
    const cfgPath = join(cfgDir, "config.json");
    await writeFile(cfgPath, "{ this is not valid json }");

    // must not throw
    await expect(lockCavemanUltra(testHome)).resolves.toBeUndefined();

    // verify file is now valid and set to ultra
    const content = await readFile(cfgPath, "utf8");
    const parsed = JSON.parse(content);
    expect(parsed.defaultMode).toBe("ultra");
  });

  test("XDG_CONFIG_HOME set → writes to XDG_CONFIG_HOME/caveman/config.json", async () => {
    const xdgDir = await mkdtemp(join(tmpdir(), "xdg-config-"));
    const originalXdg = process.env["XDG_CONFIG_HOME"];

    try {
      // set XDG_CONFIG_HOME for this test
      process.env["XDG_CONFIG_HOME"] = xdgDir;

      await lockCavemanUltra(testHome);

      // verify file is in XDG_CONFIG_HOME, not in home/.config
      const cfgPath = join(xdgDir, "caveman", "config.json");
      const content = await readFile(cfgPath, "utf8");
      const parsed = JSON.parse(content);
      expect(parsed.defaultMode).toBe("ultra");

      // verify it was NOT written to ~/.config/caveman
      const defaultCfgPath = join(testHome, ".config", "caveman", "config.json");
      expect(await Bun.file(defaultCfgPath).exists()).toBe(false);
    } finally {
      // restore original XDG_CONFIG_HOME
      if (originalXdg !== undefined) {
        process.env["XDG_CONFIG_HOME"] = originalXdg;
      } else {
        delete process.env["XDG_CONFIG_HOME"];
      }
      await rm(xdgDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 3b. W1.3 — caveman Codex/OpenCode/Pi: direct official repo mirror
//
// These tests drive the install logic in dry-run mode so no real filesystem
// writes happen. The key invariant is WHAT commands would be run (logged by
// runProcDry in dry-run mode) not whether they succeeded.
// ---------------------------------------------------------------------------

describe("installCaveman W1.3 — direct official repo copy", () => {
  let testHome: string;
  let origHome: string | undefined;
  let origFulcrumHome: string | undefined;
  let origRepoDir: string | undefined;

  beforeEach(async () => {
    testHome = await mkdtemp(join(tmpdir(), "caveman-npx-"));
    origHome = process.env["HOME"];
    origFulcrumHome = process.env["FULCRUM_HOME"];
    origRepoDir = process.env["FULCRUM_REPO_DIR"];
    process.env["HOME"] = testHome;
    process.env["FULCRUM_HOME"] = join(testHome, ".fulcrum");
    // Point to repo root so rules file is found, but dry-run prevents writes.
    process.env["FULCRUM_REPO_DIR"] = join(__dirname, "../.."); // repo root
    setDryRun(true); // prevent all file writes
  });

  afterEach(async () => {
    setDryRun(false);
    if (origHome !== undefined) process.env["HOME"] = origHome;
    else delete process.env["HOME"];
    if (origFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = origFulcrumHome;
    else delete process.env["FULCRUM_HOME"];
    if (origRepoDir !== undefined) process.env["FULCRUM_REPO_DIR"] = origRepoDir;
    else delete process.env["FULCRUM_REPO_DIR"];
    await rm(testHome, { recursive: true, force: true });
  });

  test("dry-run logs git clone for detected agent without using shared ~/.agents", async () => {
    // Create Codex dir to simulate detection. Don't create caveman subdir.
    await mkdir(join(testHome, ".codex", "skills"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => (
      cmd === "git" ? "/mock/git" : null
    ));
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(String(args[0]));
    });

    try {
      await installCaveman(testHome);
      expect(logs).toContain(`     [dry-run] would run: git clone --depth 1 https://github.com/JuliusBrussee/caveman ${join(tmpdir(), "fulcrum-caveman-dry-run")}`);
      expect(logs).toContain(`     [dry-run] would copy: ${join(tmpdir(), "fulcrum-caveman-dry-run", "skills", "*")} → ${join(testHome, ".codex", "skills")}`);
      expect(logs.some((l) => l.includes(".agents"))).toBe(false);
    } finally {
      whichSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  test("dry-run logs skip when caveman skill and Codex plugin dirs already exist (idempotency)", async () => {
    // Pre-create both Codex surfaces to simulate a complete install.
    await mkdir(join(testHome, ".codex", "skills", "caveman"), { recursive: true });
    await mkdir(join(testHome, ".codex", "plugins", "cache", "caveman", "caveman", "0.1.0", "package"), { recursive: true });
    await mkdir(join(testHome, ".fulcrum", "cache", "caveman", "skills"), { recursive: true });

    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(String(args[0]));
    });

    try {
      await installCaveman(testHome);
      // Should log "already installed" skip message for Codex.
      expect(logs.some((l) => l.includes("Codex CLI") && l.includes("already installed"))).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  test("opts dry-run prevents installCaveman writes without global dry-run state", async () => {
    setDryRun(false);
    await mkdir(join(testHome, ".codex", "skills"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => (
      cmd === "git" ? "/mock/git" : null
    ));

    try {
      await installCaveman(testHome, { dryRun: true });
      expect(await Bun.file(join(testHome, ".config", "caveman", "config.json")).exists()).toBe(false);
    } finally {
      whichSpy.mockRestore();
    }
  });

  test("real install prunes source backups from official caveman agent surfaces", async () => {
    setDryRun(false);
    await mkdir(join(testHome, ".claude", "plugins", "cache", "caveman", "caveman", "v"), { recursive: true });
    await mkdir(join(testHome, ".claude", "plugins", "marketplaces", "caveman", "tests"), { recursive: true });
    await mkdir(join(testHome, ".gemini", "extensions", "caveman", "tests"), { recursive: true });
    await writeFile(join(testHome, ".claude", "plugins", "cache", "caveman", "caveman", "v", "CLAUDE.original.md"), "backup");
    await writeFile(join(testHome, ".claude", "plugins", "cache", "caveman", "caveman", "v", "SKILL.md"), "keep");
    await writeFile(join(testHome, ".claude", "plugins", "marketplaces", "caveman", "tests", "sample.original.md"), "backup");
    await writeFile(join(testHome, ".gemini", "extensions", "caveman", "tests", "sample.original.md"), "backup");

    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await installCaveman(testHome);

      expect(await Bun.file(join(testHome, ".claude", "plugins", "cache", "caveman", "caveman", "v", "CLAUDE.original.md")).exists()).toBe(false);
      expect(await Bun.file(join(testHome, ".claude", "plugins", "cache", "caveman", "caveman", "v", "SKILL.md")).exists()).toBe(true);
      expect(await Bun.file(join(testHome, ".claude", "plugins", "marketplaces", "caveman", "tests", "sample.original.md")).exists()).toBe(false);
      expect(await Bun.file(join(testHome, ".gemini", "extensions", "caveman", "tests", "sample.original.md")).exists()).toBe(false);
    } finally {
      whichSpy.mockRestore();
      setDryRun(true);
    }
  });

  test("real install mirrors full fallback package payload with exclusions and unsupported metadata", async () => {
    setDryRun(false);
    await mkdir(join(testHome, ".codex", "skills"), { recursive: true });
    await mkdir(join(testHome, ".config", "opencode", "skills"), { recursive: true });
    await mkdir(join(testHome, ".pi", "agent", "skills"), { recursive: true });

    const source = join(testHome, "fake-caveman-source");
    await mkdir(join(source, "skills", "caveman"), { recursive: true });
    await mkdir(join(source, "skills", "compress", "scripts"), { recursive: true });
    await mkdir(join(source, "plugins", "caveman", ".codex-plugin"), { recursive: true });
    await mkdir(join(source, "plugins", "caveman", "assets"), { recursive: true });
    await mkdir(join(source, ".codex"), { recursive: true });
    await mkdir(join(source, "commands"), { recursive: true });
    await mkdir(join(source, "hooks"), { recursive: true });
    await mkdir(join(source, "rules"), { recursive: true });
    await mkdir(join(source, "docs"), { recursive: true });
    await mkdir(join(source, "tests"), { recursive: true });
    await mkdir(join(source, ".github", "workflows"), { recursive: true });
    await writeFile(join(source, "skills", "caveman", "SKILL.md"), "---\nname: caveman\n---\n");
    await writeFile(join(source, "skills", "caveman", "draft.backup.md"), "drop\n");
    await writeFile(join(source, "skills", "compress", "SKILL.md"), "---\nname: compress\n---\n");
    await writeFile(join(source, "skills", "compress", "scripts", "cli.py"), "print('compress')\n");
    await writeFile(join(source, "plugins", "caveman", ".codex-plugin", "plugin.json"), JSON.stringify({ name: "caveman", version: "0.1.0" }) + "\n");
    await writeFile(join(source, "plugins", "caveman", "assets", "caveman.svg"), "<svg />\n");
    await writeFile(join(source, ".codex", "config.toml"), "[features]\ncodex_hooks = true\n");
    await writeFile(join(source, ".codex", "hooks.json"), JSON.stringify({ hooks: { UserPromptSubmit: [{ command: "hooks/caveman-activate.js" }] } }, null, 2) + "\n");
    await writeFile(join(source, "commands", "caveman.toml"), 'prompt = "use caveman"\n');
    await writeFile(join(source, "hooks", "caveman-activate.js"), "console.log('activate')\n");
    await writeFile(join(source, "rules", "caveman-activate.md"), "rule\n");
    await writeFile(join(source, "docs", "index.html"), "<main>docs</main>\n");
    await writeFile(join(source, "AGENTS.md"), "agents rules\n");
    await writeFile(join(source, "CLAUDE.original.md"), "backup\n");
    await writeFile(join(source, "README.backup.md"), "backup\n");
    await writeFile(join(source, "gemini-extension.json"), "{}\n");
    await writeFile(join(source, "tests", "sample.md"), "drop\n");
    await writeFile(join(source, ".github", "workflows", "ci.yml"), "drop\n");

    const binDir = join(testHome, "bin");
    await mkdir(binDir, { recursive: true });
    const git = join(binDir, "git");
    await writeFile(git, [
      "#!/bin/sh",
      "set -eu",
      `src=${JSON.stringify(source)}`,
      "dest=\"$5\"",
      "mkdir -p \"$dest\"",
      "cp -R \"$src\"/. \"$dest\"",
    ].join("\n") + "\n");
    await chmod(git, 0o755);

    const originalPath = process.env["PATH"];
    process.env["PATH"] = `${binDir}:${originalPath ?? ""}`;
    try {
      await installCaveman(testHome);
    } finally {
      if (originalPath !== undefined) process.env["PATH"] = originalPath;
      else delete process.env["PATH"];
    }

    const codexPluginRoot = join(testHome, ".codex", "plugins", "cache", "caveman", "caveman", "0.1.0");
    const codexPackage = join(codexPluginRoot, "package");
    const opencodePackage = join(testHome, ".config", "opencode", "packages", "caveman");
    const piPackage = join(testHome, ".pi", "agent", "packages", "caveman");
    const cacheRoot = join(testHome, ".fulcrum", "cache", "caveman");

    expect(await Bun.file(join(testHome, ".codex", "skills", "caveman", "SKILL.md")).exists()).toBe(true);
    expect(await Bun.file(join(testHome, ".config", "opencode", "skills", "compress", "scripts", "cli.py")).exists()).toBe(true);
    expect(await Bun.file(join(testHome, ".pi", "agent", "skills", "compress", "scripts", "cli.py")).exists()).toBe(true);
    expect(await Bun.file(join(cacheRoot, "commands", "caveman.toml")).exists()).toBe(true);
    expect(await Bun.file(join(cacheRoot, "hooks", "caveman-activate.js")).exists()).toBe(true);

    expect(await Bun.file(join(codexPluginRoot, ".codex-plugin", "plugin.json")).exists()).toBe(true);
    expect(await Bun.file(join(codexPluginRoot, "assets", "caveman.svg")).exists()).toBe(true);
    expect(await Bun.file(join(codexPackage, "commands", "caveman.toml")).exists()).toBe(true);
    expect(await Bun.file(join(codexPackage, "hooks", "caveman-activate.js")).exists()).toBe(true);
    expect(await Bun.file(join(codexPackage, "docs", "index.html")).exists()).toBe(true);

    expect(await Bun.file(join(opencodePackage, "commands", "caveman.toml")).exists()).toBe(true);
    expect(await Bun.file(join(opencodePackage, "rules", "caveman-activate.md")).exists()).toBe(true);
    expect(await Bun.file(join(piPackage, "hooks", "caveman-activate.js")).exists()).toBe(true);

    expect(await Bun.file(join(codexPackage, "CLAUDE.original.md")).exists()).toBe(false);
    expect(await Bun.file(join(codexPackage, "README.backup.md")).exists()).toBe(false);
    expect(await Bun.file(join(opencodePackage, "tests", "sample.md")).exists()).toBe(false);
    expect(await Bun.file(join(piPackage, ".github", "workflows", "ci.yml")).exists()).toBe(false);

    const opencodeUnsupported = JSON.parse(await readFile(join(opencodePackage, ".fulcrum-unsupported.json"), "utf8"));
    const piUnsupported = JSON.parse(await readFile(join(piPackage, ".fulcrum-unsupported.json"), "utf8"));
    expect(opencodeUnsupported.unsupported.some((entry: { surface: string }) => entry.surface === "codex-hooks")).toBe(true);
    expect(piUnsupported.unsupported.some((entry: { surface: string }) => entry.surface === "codex-plugin")).toBe(true);
    expect(await Bun.file(join(testHome, ".fulcrum", "state", "global", "caveman-mirrors.installed")).exists()).toBe(true);

    const manifest = await getPackageSurfaceManifest("package.caveman", { sourceRoot: cacheRoot });
    expect(manifest.surfaces.some((surface) => surface.relativePath === "commands/caveman.toml")).toBe(true);
    expect(manifest.surfaces.some((surface) => surface.relativePath === "commands/caveman.md")).toBe(false);

    for (const agentId of ["codex", "opencode", "pi"] as const) {
      const report = await auditPackageParity(manifest, planPackageMirrorTargets(manifest, [agentId]), { home: testHome });
      expect(report.ok).toBe(true);
      expect(report.missing).toEqual([]);
    }
  });

});

// ---------------------------------------------------------------------------
// 3b. dry-run mode
// ---------------------------------------------------------------------------

describe("dry-run mode", () => {
  let dryHome: string;

  beforeEach(async () => {
    dryHome = await mkdtemp(join(tmpdir(), "fulcrum-dry-"));
    setDryRun(true);
  });

  afterEach(async () => {
    setDryRun(false);
    await rm(dryHome, { recursive: true, force: true });
  });

  test("assertNotAgentsPath still throws under dry-run (safety check active)", () => {
    // The guard must fire regardless of dry-run state.
    expect(() =>
      assertNotAgentsPath(join(dryHome, ".agents", "skills"), dryHome)
    ).toThrow("HARD RULE VIOLATION");
  });

  test("lockCavemanUltra in dry-run does not create config.json", async () => {
    await lockCavemanUltra(dryHome);

    const cfgPath = join(dryHome, ".config", "caveman", "config.json");
    // File must not exist — dry-run must not write.
    expect(await Bun.file(cfgPath).exists()).toBe(false);
  });

  test("spliceSentinel in dry-run does not modify an existing target file", async () => {
    // Create a target file with known content.
    const targetDir = join(dryHome, "rules-dir");
    await mkdir(targetDir, { recursive: true });
    const target = join(targetDir, "AGENTS.md");
    const original = "# My existing rules\n\nSome user content here.\n";
    await writeFile(target, original);

    // Run spliceSentinel under dry-run.
    await spliceSentinel(target, "## Fulcrum body", "test-label");

    // File must be unchanged.
    const after = await readFile(target, "utf8");
    expect(after).toBe(original);
  });

  test("spliceSentinel in dry-run does not create a new target file", async () => {
    const targetDir = join(dryHome, "new-rules-dir");
    await mkdir(targetDir, { recursive: true });
    const target = join(targetDir, "AGENTS.md");
    // File does not exist yet.

    await spliceSentinel(target, "## Fulcrum body", "test-label");

    // File must still not exist.
    expect(await Bun.file(target).exists()).toBe(false);
  });

  test("install dry-run defaults to minimal profile without global skills or vendor packages", async () => {
    const origHome = process.env["HOME"];
    const origFulcrumHome = process.env["FULCRUM_HOME"];
    const origRepoDir = process.env["FULCRUM_REPO_DIR"];
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    try {
      process.env["HOME"] = dryHome;
      process.env["FULCRUM_HOME"] = join(dryHome, ".fulcrum");
      process.env["FULCRUM_REPO_DIR"] = join(__dirname, "../..");
      await installRun(["--dry-run"]);
      expect(logs.join("\n")).toContain("profile.minimal");
      expect(logs.join("\n")).toContain("DRY RUN");
      expect(logs.join("\n")).not.toContain("skills.authored");
      expect(logs.join("\n")).not.toContain("skills.upstream");
      expect(logs.join("\n")).not.toContain("package.cloudflare");
      expect(logs.join("\n")).not.toContain("package.superpowers");
    } finally {
      logSpy.mockRestore();
      if (origHome !== undefined) process.env["HOME"] = origHome;
      else delete process.env["HOME"];
      if (origFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = origFulcrumHome;
      else delete process.env["FULCRUM_HOME"];
      if (origRepoDir !== undefined) process.env["FULCRUM_REPO_DIR"] = origRepoDir;
      else delete process.env["FULCRUM_REPO_DIR"];
    }
  });

  test("install --profile full keeps the old full bootstrap surface explicit", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts", "install", "--dry-run", "--profile", "full"], {
      cwd: join(__dirname, "../.."),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: dryHome,
        FULCRUM_HOME: join(dryHome, ".fulcrum"),
        FULCRUM_REPO_DIR: join(__dirname, "../.."),
      },
    });
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    const exit = await proc.exited;

    expect(exit).toBe(0);
    expect(err).toBe("");
    expect(out).toContain("profile.default");
    expect(out).toContain("skills.authored");
    expect(out).toContain("package.cloudflare");
    expect(out).toContain("mcp.registry");
  });

  test("install --profile rules-only only plans the global rules block", async () => {
    const proc = Bun.spawn(["bun", "src/index.ts", "install", "--dry-run", "--profile", "rules-only"], {
      cwd: join(__dirname, "../.."),
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        HOME: dryHome,
        FULCRUM_HOME: join(dryHome, ".fulcrum"),
        FULCRUM_REPO_DIR: join(__dirname, "../.."),
      },
    });
    const out = await new Response(proc.stdout).text();
    const err = await new Response(proc.stderr).text();
    const exit = await proc.exited;

    expect(exit).toBe(0);
    expect(err).toBe("");
    expect(out).toContain("rules.global");
    expect(out).not.toContain("policy.tool-output");
    expect(out).not.toContain("mcp.context7");
    expect(out).not.toContain("skills.authored");
  });

  test("install --no-skills excludes skill components from dry-run plan", async () => {
    const origHome = process.env["HOME"];
    const origFulcrumHome = process.env["FULCRUM_HOME"];
    const origRepoDir = process.env["FULCRUM_REPO_DIR"];
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    try {
      process.env["HOME"] = dryHome;
      process.env["FULCRUM_HOME"] = join(dryHome, ".fulcrum");
      process.env["FULCRUM_REPO_DIR"] = join(__dirname, "../..");
      await installRun(["--dry-run", "--no-skills"]);
      expect(logs.join("\n")).toContain("profile.minimal");
      expect(logs.join("\n")).not.toContain("skills.authored");
      expect(logs.join("\n")).not.toContain("skills.upstream");
    } finally {
      logSpy.mockRestore();
      if (origHome !== undefined) process.env["HOME"] = origHome;
      else delete process.env["HOME"];
      if (origFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = origFulcrumHome;
      else delete process.env["FULCRUM_HOME"];
      if (origRepoDir !== undefined) process.env["FULCRUM_REPO_DIR"] = origRepoDir;
      else delete process.env["FULCRUM_REPO_DIR"];
    }
  });

  test("default install registers all builtin MCPs and enables DeepWiki plus Repomix", async () => {
    setDryRun(false);
    const origHome = process.env["HOME"];
    const origFulcrumHome = process.env["FULCRUM_HOME"];
    const origRepoDir = process.env["FULCRUM_REPO_DIR"];
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    try {
      process.env["HOME"] = dryHome;
      process.env["FULCRUM_HOME"] = join(dryHome, ".fulcrum");
      process.env["FULCRUM_REPO_DIR"] = join(__dirname, "../..");
      await mkdir(join(dryHome, ".codex"), { recursive: true });
      await mkdir(join(dryHome, ".gemini"), { recursive: true });
      await mkdir(join(dryHome, ".config", "opencode"), { recursive: true });
      await installRun([]);
      const reg = await loadRegistry();
      expect(Object.keys(reg.servers)).toHaveLength(17);
      expect(reg.servers["deepwiki"]?.enabled.codex).toBe(true);
      expect(reg.servers["repomix"]?.enabled.codex).toBe(true);
      expect(reg.servers["repomix"]?.enabled.opencode).toBe(true);
      expect(reg.servers["repomix"]?.enabled.pi).toBe(true);
      expect(reg.servers["repomix"]?.enabled.gemini).toBeUndefined();
      expect(reg.servers["context7"]?.enabled.codex).toBeUndefined();
      expect(reg.servers["cloudflare-docs"]).toBeDefined();

      const codexConfig = await readFile(join(dryHome, ".codex", "config.toml"), "utf8");
      expect(codexConfig).toContain("[mcp_servers.context7]");
      expect(codexConfig).toContain("enabled = false");
      const repomixBlock = codexConfig.match(/# BEGIN FULCRUM MCP repomix[\s\S]*?# END FULCRUM MCP repomix/)?.[0] ?? "";
      expect(repomixBlock).toContain("[mcp_servers.repomix]");
      expect(repomixBlock).not.toContain("enabled = false");

      const geminiSettings = JSON.parse(await readFile(join(dryHome, ".gemini", "settings.json"), "utf8"));
      const geminiEnablement = JSON.parse(await readFile(join(dryHome, ".gemini", "mcp-server-enablement.json"), "utf8"));
      expect(geminiSettings.mcpServers.context7).toBeDefined();
      expect(geminiEnablement.context7.enabled).toBe(false);

      const opencode = JSON.parse(await readFile(join(dryHome, ".config", "opencode", "opencode.json"), "utf8"));
      expect(opencode.mcp.context7.enabled).toBe(false);
    } finally {
      logSpy.mockRestore();
      if (origHome !== undefined) process.env["HOME"] = origHome;
      else delete process.env["HOME"];
      if (origFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = origFulcrumHome;
      else delete process.env["FULCRUM_HOME"];
      if (origRepoDir !== undefined) process.env["FULCRUM_REPO_DIR"] = origRepoDir;
      else delete process.env["FULCRUM_REPO_DIR"];
      setDryRun(true);
    }
  });

  test("install --dry-run --with-project forwards dry-run to init", async () => {
    const origHome = process.env["HOME"];
    const origFulcrumHome = process.env["FULCRUM_HOME"];
    const origRepoDir = process.env["FULCRUM_REPO_DIR"];
    const origPath = process.env["PATH"];
    const projectDir = join(dryHome, "project");
    await mkdir(projectDir, { recursive: true });

    try {
      process.env["HOME"] = dryHome;
      process.env["FULCRUM_HOME"] = join(dryHome, ".fulcrum");
      process.env["FULCRUM_REPO_DIR"] = join(__dirname, "../..");
      process.env["PATH"] = "/usr/bin:/bin";

      await installRun(["--dry-run", "--with-project", projectDir]);

      expect(await Bun.file(join(projectDir, "AGENTS.md")).exists()).toBe(false);
      expect(await Bun.file(join(projectDir, ".claude", "CLAUDE.md")).exists()).toBe(false);
      expect(await Bun.file(join(projectDir, ".gitignore")).exists()).toBe(false);
    } finally {
      if (origHome !== undefined) process.env["HOME"] = origHome;
      else delete process.env["HOME"];
      if (origFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = origFulcrumHome;
      else delete process.env["FULCRUM_HOME"];
      if (origRepoDir !== undefined) process.env["FULCRUM_REPO_DIR"] = origRepoDir;
      else delete process.env["FULCRUM_REPO_DIR"];
      if (origPath !== undefined) process.env["PATH"] = origPath;
      else delete process.env["PATH"];
    }
  });
});

// ---------------------------------------------------------------------------
// 5. MCP registry entries (W2)
// ---------------------------------------------------------------------------

import { applyBuiltinMcpDefaultState, installMcpRegistryEntries } from "./install.ts";
import { ALL_AGENT_IDS, isEnabled, loadRegistry, setEnabled } from "./mcp-registry.ts";
import { BUILTIN_MCPS } from "./mcp-builtins.ts";

describe("installMcpRegistryEntries", () => {
  let regHome: string;
  let origFulcrumHome: string | undefined;
  let origHomeEnv: string | undefined;

  beforeEach(async () => {
    regHome = await mkdtemp(join(tmpdir(), "fulcrum-mcp-install-"));
    origFulcrumHome = process.env["FULCRUM_HOME"];
    origHomeEnv = process.env["HOME"];
    process.env["FULCRUM_HOME"] = join(regHome, ".fulcrum");
    process.env["HOME"] = regHome;
    setDryRun(false);
  });

  afterEach(async () => {
    setDryRun(false);
    if (origFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = origFulcrumHome;
    else delete process.env["FULCRUM_HOME"];
    if (origHomeEnv !== undefined) process.env["HOME"] = origHomeEnv;
    else delete process.env["HOME"];
    await rm(regHome, { recursive: true, force: true });
  });

  test("registers github server with correct transport+url", async () => {
    await installMcpRegistryEntries(regHome);
    const reg = await loadRegistry();
    const github = reg.servers["github"];
    expect(github).toBeDefined();
    expect(github!.transport).toBe("http");
    expect(github!.url).toBe("https://api.githubcopilot.com/mcp/");
    expect(github!.default_enabled).toBe(false);
    expect(github!.auth_env_vars).toContain("GITHUB_TOKEN");
  });

  test("registers repomix server with correct transport+command", async () => {
    await installMcpRegistryEntries(regHome);
    const reg = await loadRegistry();
    const repomix = reg.servers["repomix"];
    expect(repomix).toBeDefined();
    expect(repomix!.transport).toBe("stdio");
    expect(repomix!.command).toBe("npx -y repomix@latest --mcp");
    expect(repomix!.default_enabled).toBe(false);
  });

  test("idempotent — second call does not duplicate entries", async () => {
    await installMcpRegistryEntries(regHome);
    await installMcpRegistryEntries(regHome);
    const reg = await loadRegistry();
    expect(Object.keys(reg.servers).filter((k) => k === "github")).toHaveLength(1);
    expect(Object.keys(reg.servers).filter((k) => k === "repomix")).toHaveLength(1);
  });

  test("github and repomix registry specs are default-disabled before recommended defaults apply", async () => {
    await installMcpRegistryEntries(regHome);
    const reg = await loadRegistry();
    expect(reg.servers["github"]!.default_enabled).toBe(false);
    expect(reg.servers["repomix"]!.default_enabled).toBe(false);
    expect(reg.servers["repomix"]!.agent_visibility["gemini"]).toBe(false);
  });

  test("registers deepwiki and context7 while keeping specs default-disabled", async () => {
    await installMcpRegistryEntries(regHome);
    const reg = await loadRegistry();
    expect(reg.servers["deepwiki"]).toBeDefined();
    expect(reg.servers["deepwiki"]!.transport).toBe("http");
    expect(reg.servers["deepwiki"]!.url).toBe("https://mcp.deepwiki.com/mcp");
    expect(reg.servers["deepwiki"]!.default_enabled).toBe(false);
    expect(reg.servers["context7"]).toBeDefined();
    expect(reg.servers["context7"]!.default_enabled).toBe(false);
    expect(reg.servers["context7"]!.auth_env_vars).toEqual(["CONTEXT7_API_KEY"]);
  });

  test("recommended default state enables DeepWiki and Repomix only", async () => {
    await installMcpRegistryEntries(regHome);
    await applyBuiltinMcpDefaultState("minimal");
    const reg = await loadRegistry();
    expect(reg.servers["deepwiki"]!.enabled["codex"]).toBe(true);
    expect(reg.servers["context7"]!.enabled["codex"]).toBeUndefined();
    expect(reg.servers["repomix"]!.enabled["codex"]).toBe(true);
    expect(reg.servers["repomix"]!.enabled["opencode"]).toBe(true);
    expect(reg.servers["repomix"]!.enabled["pi"]).toBe(true);
    expect(reg.servers["repomix"]!.enabled["gemini"]).toBeUndefined();
    expect(reg.servers["github"]!.enabled["codex"]).toBeUndefined();
  });

  test("recommended default state re-enables stale disabled Repomix state", async () => {
    await installMcpRegistryEntries(regHome);
    await setEnabled("repomix", false, { agents: ["codex", "opencode", "pi"] });

    await applyBuiltinMcpDefaultState("minimal");

    const reg = await loadRegistry();
    expect(reg.servers["repomix"]!.enabled["codex"]).toBe(true);
    expect(reg.servers["repomix"]!.enabled["opencode"]).toBe(true);
    expect(reg.servers["repomix"]!.enabled["pi"]).toBe(true);
  });

  test("enable-all default state enables every builtin MCP for visible agents", async () => {
    await installMcpRegistryEntries(regHome);
    await applyBuiltinMcpDefaultState("all");
    const reg = await loadRegistry();

    for (const { name } of BUILTIN_MCPS) {
      const server = reg.servers[name]!;
      for (const agentId of ALL_AGENT_IDS) {
        if (!server.agent_visibility[agentId]) continue;
        expect(isEnabled(server, agentId)).toBe(true);
      }
    }
  });

  test("no default state leaves existing MCP state untouched", async () => {
    await installMcpRegistryEntries(regHome);
    await applyBuiltinMcpDefaultState("minimal");
    await applyBuiltinMcpDefaultState("none");
    const reg = await loadRegistry();
    expect(reg.servers["deepwiki"]!.enabled["codex"]).toBe(true);
    expect(reg.servers["context7"]!.enabled["codex"]).toBeUndefined();
    expect(reg.servers["repomix"]!.enabled["codex"]).toBe(true);
    expect(reg.servers["github"]!.enabled["codex"]).toBeUndefined();
  });

  test("legacy Codex DeepWiki config is reconciled without duplicate TOML tables", async () => {
    await mkdir(join(regHome, ".codex"), { recursive: true });
    await writeFile(
      join(regHome, ".codex", "config.toml"),
      `# BEGIN FULCRUM MCP deepwiki
[mcp_servers.deepwiki]
url = "https://mcp.deepwiki.com/mcp"
# END FULCRUM MCP deepwiki
`,
    );
    await installMcpRegistryEntries(regHome);
    await applyBuiltinMcpDefaultState("minimal");

    const config = await readFile(join(regHome, ".codex", "config.toml"), "utf8");
    expect(config.match(/\[mcp_servers\.deepwiki\]/g)).toHaveLength(1);
    const reg = await loadRegistry();
    expect(reg.servers["deepwiki"]).toBeDefined();
    expect(reg.servers["deepwiki"]!.enabled["codex"]).toBe(true);
  });

  test("dry-run does not write registry file", async () => {
    setDryRun(true);
    await installMcpRegistryEntries(regHome);
    const reg = await loadRegistry();
    expect(Object.keys(reg.servers)).toHaveLength(0);
  });
});
