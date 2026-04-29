// Tests for caveman install logic in install.ts.
// Uses Bun test runner; no GitHub network access.

import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertNotAgentsPath, installCaveman, lockCavemanUltra, spliceSentinel, setDryRun } from "./install.ts";
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
// 3b. W1.3 — caveman Codex/OpenCode/Pi: npx skills add canonical path + fallback
//
// These tests drive the install logic in dry-run mode so no real filesystem
// writes happen. The key invariant is WHAT commands would be run (logged by
// runProcDry in dry-run mode) not whether they succeeded.
// ---------------------------------------------------------------------------

describe("installCaveman W1.3 — npx skills add canonical path", () => {
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

  test("dry-run logs npx skills add for detected agent (npx found on real PATH)", async () => {
    // Create Codex dir to simulate detection. Don't create caveman subdir.
    await mkdir(join(testHome, ".codex", "skills"), { recursive: true });
    // Note: npx presence is real — test just verifies npx path is chosen when
    // npx exists on the real machine. If npx is absent, fallback path fires
    // instead — both are acceptable; the key invariant is no crash.
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(String(args[0]));
    });

    try {
      await installCaveman(testHome);
      // Either npx path or skip must be logged for Codex.
      const codexHandled = logs.some((l) =>
        (l.includes("npx") && l.includes("JuliusBrussee/caveman")) ||
        l.includes("npx not on PATH") ||
        l.includes("Codex CLI caveman")
      );
      expect(codexHandled).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  test("dry-run logs skip when caveman skill dir already exists (idempotency)", async () => {
    // Pre-create the caveman skill dir to simulate already installed.
    await mkdir(join(testHome, ".codex", "skills", "caveman"), { recursive: true });

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
});

// ---------------------------------------------------------------------------
// 5. MCP registry entries (W2)
// ---------------------------------------------------------------------------

import { applyBuiltinMcpDefaultState, installMcpRegistryEntries } from "./install.ts";
import { loadRegistry } from "./mcp-registry.ts";

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
    expect(repomix!.command).toBe("npx -y repomix --mcp");
    expect(repomix!.default_enabled).toBe(false);
  });

  test("idempotent — second call does not duplicate entries", async () => {
    await installMcpRegistryEntries(regHome);
    await installMcpRegistryEntries(regHome);
    const reg = await loadRegistry();
    expect(Object.keys(reg.servers).filter((k) => k === "github")).toHaveLength(1);
    expect(Object.keys(reg.servers).filter((k) => k === "repomix")).toHaveLength(1);
  });

  test("neither github nor repomix are default-enabled", async () => {
    await installMcpRegistryEntries(regHome);
    const reg = await loadRegistry();
    expect(reg.servers["github"]!.default_enabled).toBe(false);
    expect(reg.servers["repomix"]!.default_enabled).toBe(false);
  });

  test("context7 is the minimal default builtin MCP", async () => {
    await installMcpRegistryEntries(regHome);
    const reg = await loadRegistry();
    expect(reg.servers["context7"]).toBeDefined();
    expect(reg.servers["context7"]!.default_enabled).toBe(false);
    expect(reg.servers["context7"]!.auth_env_vars).toEqual(["CONTEXT7_API_KEY"]);
  });

  test("minimal default state enables context7 without enabling github", async () => {
    await installMcpRegistryEntries(regHome);
    await applyBuiltinMcpDefaultState("minimal");
    const reg = await loadRegistry();
    expect(reg.servers["context7"]!.enabled["codex"]).toBe(true);
    expect(reg.servers["github"]!.enabled["codex"]).toBeUndefined();
  });

  test("no default state leaves existing MCP state untouched", async () => {
    await installMcpRegistryEntries(regHome);
    await applyBuiltinMcpDefaultState("minimal");
    await applyBuiltinMcpDefaultState("none");
    const reg = await loadRegistry();
    expect(reg.servers["context7"]!.enabled["codex"]).toBe(true);
    expect(reg.servers["github"]!.enabled["codex"]).toBeUndefined();
  });

  test("dry-run does not write registry file", async () => {
    setDryRun(true);
    await installMcpRegistryEntries(regHome);
    const reg = await loadRegistry();
    expect(Object.keys(reg.servers)).toHaveLength(0);
  });
});
