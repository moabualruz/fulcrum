import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { removeCavemanCopies, removeExactLine, removeSentinelBlock, run, setDryRun } from "./uninstall.ts";
import * as proc from "../utils/proc.ts";

let TMP: string;
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;
let originalRepoDir: string | undefined;

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-uninstall-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  originalRepoDir = process.env["FULCRUM_REPO_DIR"];
  process.env["HOME"] = TMP;
  process.env["FULCRUM_HOME"] = join(TMP, ".fulcrum");
  process.env["FULCRUM_REPO_DIR"] = TMP;
  setDryRun(false);
});

afterEach(async () => {
  setDryRun(false);
  if (originalHome !== undefined) process.env["HOME"] = originalHome;
  else delete process.env["HOME"];
  if (originalFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = originalFulcrumHome;
  else delete process.env["FULCRUM_HOME"];
  if (originalRepoDir !== undefined) process.env["FULCRUM_REPO_DIR"] = originalRepoDir;
  else delete process.env["FULCRUM_REPO_DIR"];
  await rm(TMP, { recursive: true, force: true });
});

describe("removeSentinelBlock", () => {
  test("removes only Fulcrum rules block and preserves user content", async () => {
    const file = join(TMP, "AGENTS.md");
    await writeFile(
      file,
      [
        "# User rules",
        "",
        "<!-- BEGIN FULCRUM RULES -->",
        "managed",
        "<!-- END FULCRUM RULES -->",
        "",
        "Keep me",
        "",
      ].join("\n"),
    );

    await removeSentinelBlock(file, "Test");

    expect(await readFile(file, "utf8")).toBe("# User rules\n\nKeep me\n");
  });

  test("refuses mismatched markers", async () => {
    const file = join(TMP, "bad.md");
    await writeFile(file, "<!-- BEGIN FULCRUM RULES -->\nmanaged\n");

    await removeSentinelBlock(file, "Bad");

    expect(await readFile(file, "utf8")).toBe("<!-- BEGIN FULCRUM RULES -->\nmanaged\n");
  });
});

describe("removeExactLine", () => {
  test("removes only the generated Gemini import line", async () => {
    const file = join(TMP, "GEMINI.md");
    await writeFile(file, "before\n@AGENTS.md\nafter\n");

    await removeExactLine(file, "@AGENTS.md", "Gemini import");

    expect(await readFile(file, "utf8")).toBe("before\nafter\n");
  });
});

describe("run", () => {
  test("dry-run delegates to component default profile removal", async () => {
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    try {
      await run(["--dry-run"]);
    } finally {
      logSpy.mockRestore();
    }

    expect(logs.join("\n")).toContain("profile.default");
    expect(logs.join("\n")).toContain("DRY RUN");
  });

  test("dry-run keeps caveman unless explicitly included", async () => {
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    try {
      await run(["--dry-run"]);
    } finally {
      logSpy.mockRestore();
    }

    expect(logs.join("\n")).not.toContain("package.caveman");
    expect(logs.join("\n")).toContain("keep caveman");
  });

  test("removes managed namespaces, hook state, and unmodified policy", async () => {
    await mkdir(join(TMP, "config"), { recursive: true });
    await writeFile(join(TMP, "config", "tool-output-policy.toml"), "default = true\n");

    await mkdir(join(TMP, ".fulcrum", "hooks", "snippets"), { recursive: true });
    await mkdir(join(TMP, ".fulcrum", "hooks", "enabled"), { recursive: true });
    await writeFile(join(TMP, ".fulcrum", "tool-output-policy.toml"), "default = true\n");
    await mkdir(join(TMP, ".claude"), { recursive: true });
    await writeFile(
      join(TMP, ".claude", "settings.json"),
      JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "fulcrum hook index-check" }] }] } }, null, 2) + "\n",
    );
    await mkdir(join(TMP, ".config", "opencode", "plugins"), { recursive: true });
    await writeFile(join(TMP, ".config", "opencode", "plugins", "fulcrum-index-check.ts"), "managed\n");

    await mkdir(join(TMP, ".codex", "skills", "fulcrum", "jq"), { recursive: true });
    await mkdir(join(TMP, ".codex", "skills", "fulcrum-upstream", "ast-grep"), { recursive: true });
    await mkdir(join(TMP, ".gemini", "extensions", "fulcrum-skills", "skills", "jq"), { recursive: true });
    await mkdir(join(TMP, ".gemini", "extensions", "fulcrum-upstream-skills", "skills", "ast-grep"), { recursive: true });
    await writeFile(join(TMP, ".codex", "AGENTS.md"), "user\n<!-- BEGIN FULCRUM RULES -->\nmanaged\n<!-- END FULCRUM RULES -->\n");
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    await writeFile(join(TMP, ".gemini", "GEMINI.md"), "@AGENTS.md\n");

    await run([]);

    expect(await Bun.file(join(TMP, ".codex", "skills", "fulcrum")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".codex", "skills", "fulcrum-upstream")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".gemini", "extensions", "fulcrum-skills")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".gemini", "extensions", "fulcrum-upstream-skills")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".fulcrum", "hooks", "snippets")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".fulcrum", "hooks", "enabled")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".claude", "settings.json")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".config", "opencode", "plugins", "fulcrum-index-check.ts")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".fulcrum", "tool-output-policy.toml")).exists()).toBe(false);
    expect(await readFile(join(TMP, ".codex", "AGENTS.md"), "utf8")).toBe("user\n");
    expect(await readFile(join(TMP, ".gemini", "GEMINI.md"), "utf8")).toBe("");
  });

  test("removes curated upstream skills and empty hook containers", async () => {
    await mkdir(join(TMP, "skills"), { recursive: true });
    await writeFile(join(TMP, "skills", "upstream.lock"), [
      "[meta]",
      "schema_version = 1",
      "",
      "[skills.superpowers-using-superpowers]",
      'source = "https://github.com/obra/superpowers"',
      'subpath = "skills/using-superpowers"',
      'ref = "main"',
      'tree_sha = "6efe32c9e2dd002d0c394e861e0529675d1ab32e"',
      'license = "MIT"',
      'author_class = "individual"',
      'pinned_on = "2026-04-28"',
      'review_due = "2026-07-27"',
      "",
      "[skills.cloudflare-platform]",
      'source = "https://github.com/cloudflare/skills"',
      'subpath = "skills/cloudflare"',
      'ref = "main"',
      'tree_sha = "7c449def4e0c63daa27212d853094e4c8e37bbe8"',
      'license = "Apache-2.0"',
      'author_class = "tool-vendor"',
      'pinned_on = "2026-04-28"',
      'review_due = "2026-07-27"',
      "",
    ].join("\n"));

    await mkdir(join(TMP, ".codex", "skills", "superpowers-using-superpowers"), { recursive: true });
    await mkdir(join(TMP, ".codex", "skills", "cloudflare-platform"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent", "skills", "using-superpowers"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent", "skills", "cloudflare"), { recursive: true });
    await mkdir(join(TMP, ".gemini", "skills", "superpowers-using-superpowers"), { recursive: true });
    for (const marker of [
      join(TMP, ".fulcrum", "state", "global", "upstream-skills", "codex", "superpowers-using-superpowers.installed"),
      join(TMP, ".fulcrum", "state", "global", "upstream-skills", "codex", "cloudflare-platform.installed"),
      join(TMP, ".fulcrum", "state", "global", "upstream-skills", "pi", "using-superpowers.installed"),
      join(TMP, ".fulcrum", "state", "global", "upstream-skills", "pi", "cloudflare.installed"),
      join(TMP, ".fulcrum", "state", "global", "upstream-skills", "gemini", "superpowers-using-superpowers.installed"),
    ]) {
      await mkdir(join(marker, ".."), { recursive: true });
      await writeFile(marker, "installed\n");
    }
    await writeFile(join(TMP, ".codex", "hooks.json"), JSON.stringify({ hooks: { UserPromptSubmit: [] } }, null, 2) + "\n");
    await writeFile(join(TMP, ".gemini", "settings.json"), JSON.stringify({ mcpServers: {}, hooks: { PreCompress: [] }, security: { auth: { selectedType: "oauth-personal" } } }, null, 2) + "\n");
    await mkdir(join(TMP, ".config", "opencode"), { recursive: true });
    await writeFile(join(TMP, ".config", "opencode", "opencode.json"), JSON.stringify({ $schema: "https://opencode.ai/config.json", mcp: {}, plugin: [] }, null, 2) + "\n");
    await writeFile(join(TMP, ".pi", "agent", "settings.json"), JSON.stringify({ packages: [], defaultModel: "gpt-5.5" }, null, 2) + "\n");

    await run([]);

    expect(await Bun.file(join(TMP, ".codex", "skills", "superpowers-using-superpowers")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".codex", "skills", "cloudflare-platform")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".pi", "agent", "skills", "using-superpowers")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".pi", "agent", "skills", "cloudflare")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".gemini", "skills", "superpowers-using-superpowers")).exists()).toBe(false);
    expect(await Bun.file(join(TMP, ".codex", "hooks.json")).exists()).toBe(false);
    const geminiSettings = JSON.parse(await readFile(join(TMP, ".gemini", "settings.json"), "utf8"));
    expect(geminiSettings.mcpServers).toBeUndefined();
    expect(geminiSettings.hooks).toBeUndefined();
    const openCode = JSON.parse(await readFile(join(TMP, ".config", "opencode", "opencode.json"), "utf8"));
    expect(openCode.mcp).toBeUndefined();
    expect(openCode.plugin).toBeUndefined();
    const piSettings = JSON.parse(await readFile(join(TMP, ".pi", "agent", "settings.json"), "utf8"));
    expect(piSettings.packages).toBeUndefined();
  });

  test("--purge removes markerless Claude plugin cache leftovers", async () => {
    const leftovers = [
      [".claude", "plugins", "cache", "fulcrum"],
      [".claude", "plugins", "marketplaces", "fulcrum"],
      [".claude", "plugins", "cache", "caveman"],
      [".claude", "plugins", "marketplaces", "caveman"],
      [".claude", "plugins", "cache", "repomix"],
      [".claude", "plugins", "marketplaces", "repomix"],
      [".claude", "plugins", "cache", "cloudflare"],
      [".claude", "plugins", "marketplaces", "cloudflare"],
      [".claude", "plugins", "cache", "claude-plugins-official", "superpowers"],
    ];
    for (const parts of leftovers) {
      await mkdir(join(TMP, ...parts), { recursive: true });
      await writeFile(join(TMP, ...parts, "marker.txt"), "old\n");
    }

    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    try {
      await run(["--purge", "--include-caveman"]);
    } finally {
      whichSpy.mockRestore();
    }

    for (const parts of leftovers) {
      expect(await Bun.file(join(TMP, ...parts)).exists()).toBe(false);
    }
  });

  test("preserves unmarked user-owned upstream vendor skill dirs", async () => {
    await mkdir(join(TMP, "skills"), { recursive: true });
    await writeFile(join(TMP, "skills", "upstream.lock"), [
      "[meta]",
      "schema_version = 1",
      "",
      "[skills.wrangler]",
      'source = "https://github.com/cloudflare/skills"',
      'subpath = "skills/wrangler"',
      'ref = "main"',
      'tree_sha = "7c449def4e0c63daa27212d853094e4c8e37bbe8"',
      'license = "Apache-2.0"',
      'author_class = "tool-vendor"',
      'pinned_on = "2026-04-28"',
      'review_due = "2026-07-27"',
      "",
    ].join("\n"));
    await mkdir(join(TMP, ".codex", "skills", "wrangler"), { recursive: true });
    await writeFile(join(TMP, ".codex", "skills", "wrangler", "SKILL.md"), "user-owned\n");

    await run([]);

    expect(await readFile(join(TMP, ".codex", "skills", "wrangler", "SKILL.md"), "utf8")).toBe("user-owned\n");
  });

  test("keeps modified policy without --purge", async () => {
    await mkdir(join(TMP, "config"), { recursive: true });
    await mkdir(join(TMP, ".fulcrum"), { recursive: true });
    await writeFile(join(TMP, "config", "tool-output-policy.toml"), "default = true\n");
    await writeFile(join(TMP, ".fulcrum", "tool-output-policy.toml"), "user = true\n");

    await run([]);

    expect(await readFile(join(TMP, ".fulcrum", "tool-output-policy.toml"), "utf8")).toBe("user = true\n");
  });
});

// ---------------------------------------------------------------------------
// W1.1 — caveman Claude uninstall: `claude plugin uninstall caveman@caveman`
// ---------------------------------------------------------------------------

describe("removeCavemanCopies — W1.1 Claude plugin uninstall", () => {
  test("opts dry-run logs without running or removing filesystem copies", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    await mkdir(join(TMP, ".codex", "skills", "caveman"), { recursive: true });
    await writeFile(join(TMP, ".codex", "skills", "caveman", "SKILL.md"), "caveman\n");
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => cmd === "claude" ? "/usr/local/bin/claude" : null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    try {
      await removeCavemanCopies(TMP, { dryRun: true });
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
    expect(runSpy.mock.calls).toHaveLength(0);
    expect(logs).toContain("     [dry-run] would run: claude plugin uninstall caveman@caveman");
    expect(await Bun.file(join(TMP, ".codex", "skills", "caveman", "SKILL.md")).exists()).toBe(true);
  });

  test("calls claude plugin uninstall when .claude exists and claude on PATH", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    // Create the caveman install dir so removePath has something to clean up.
    await mkdir(join(TMP, ".claude", "plugins", "cache", "caveman", "caveman"), { recursive: true });
    await mkdir(join(TMP, ".claude", "plugins", "marketplaces", "caveman"), { recursive: true });

    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => {
      if (cmd === "claude") return "/usr/local/bin/claude";
      if (cmd === "npx") return null;
      return null;
    });
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });

    try {
      await run(["--include-caveman"]);
      const calls = runSpy.mock.calls.map((c) => c[0]);
      const claudeUninstall = calls.find(
        (cmd) => Array.isArray(cmd) && cmd.includes("plugin") && cmd.includes("uninstall") && cmd.includes("caveman@caveman"),
      );
      expect(claudeUninstall).toBeDefined();
      expect(await Bun.file(join(TMP, ".claude", "plugins", "cache", "caveman")).exists()).toBe(false);
      expect(await Bun.file(join(TMP, ".claude", "plugins", "marketplaces", "caveman")).exists()).toBe(false);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
  });

  test("skips claude uninstall when .claude dir absent", async () => {
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    try {
      await run(["--include-caveman"]);
      const calls = runSpy.mock.calls.map((c) => c[0]);
      const claudeUninstall = calls.find(
        (cmd) => Array.isArray(cmd) && cmd.includes("plugin") && cmd.includes("uninstall"),
      );
      expect(claudeUninstall).toBeUndefined();
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
  });

  test("logs and continues when claude plugin uninstall exits non-zero (best-effort)", async () => {
    await mkdir(join(TMP, ".claude"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => {
      if (cmd === "claude") return "/usr/local/bin/claude";
      return null;
    });
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 1, stdout: "", stderr: "not found" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(String(args[0]));
    });
    try {
      // Must not throw even though run returns non-zero.
      await expect(run(["--include-caveman"])).resolves.toBeUndefined();
      expect(logs.some((l) => l.includes("continuing"))).toBe(true);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// W2 — MCP registry uninstall
// ---------------------------------------------------------------------------

import { registerServer, DEFAULT_GITHUB_SERVER, DEFAULT_REPOMIX_SERVER } from "./mcp-registry.ts";

describe("uninstall MCP registry (W2)", () => {
  test("registry file deleted by default (no --keep-state)", async () => {
    const stateDir = join(TMP, ".fulcrum", "state", "global");
    await mkdir(stateDir, { recursive: true });
    await registerServer("github", DEFAULT_GITHUB_SERVER);
    await registerServer("repomix", DEFAULT_REPOMIX_SERVER);

    await run([]);

    const registryFile = join(TMP, ".fulcrum", "state", "global", "mcp-registry.toml");
    expect(await Bun.file(registryFile).exists()).toBe(false);
  });

  test("--keep-state preserves registry file", async () => {
    const stateDir = join(TMP, ".fulcrum", "state", "global");
    await mkdir(stateDir, { recursive: true });
    await registerServer("github", DEFAULT_GITHUB_SERVER);

    await run(["--keep-state"]);

    const registryFile = join(TMP, ".fulcrum", "state", "global", "mcp-registry.toml");
    expect(await Bun.file(registryFile).exists()).toBe(true);
  });

  test("uninstall when registry not present does not throw", async () => {
    // No registry file created.
    await expect(run([])).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// W1.2 — caveman Gemini uninstall: `gemini extensions uninstall caveman`
// ---------------------------------------------------------------------------

describe("removeCavemanCopies — W1.2 Gemini extension uninstall", () => {
  test("calls gemini extensions uninstall when .gemini exists and gemini on PATH", async () => {
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    await mkdir(join(TMP, ".gemini", "extensions", "caveman"), { recursive: true });

    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => {
      if (cmd === "gemini") return "/usr/local/bin/gemini";
      if (cmd === "npx") return null;
      return null;
    });
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });

    try {
      await run(["--include-caveman"]);
      const calls = runSpy.mock.calls.map((c) => c[0]);
      const geminiUninstall = calls.find(
        (cmd) => Array.isArray(cmd) && cmd[0] === "gemini" && cmd.includes("uninstall") && cmd.includes("caveman"),
      );
      expect(geminiUninstall).toBeDefined();
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
  });

  test("skips gemini uninstall when gemini not on PATH", async () => {
    await mkdir(join(TMP, ".gemini"), { recursive: true });
    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });
    const logs: string[] = [];
    const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(String(args[0]));
    });
    try {
      await run(["--include-caveman"]);
      const calls = runSpy.mock.calls.map((c) => c[0]);
      const geminiUninstall = calls.find(
        (cmd) => Array.isArray(cmd) && cmd[0] === "gemini" && cmd.includes("uninstall"),
      );
      expect(geminiUninstall).toBeUndefined();
      expect(logs.some((l) => l.includes("not on PATH"))).toBe(true);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
  // W1.4 — caveman Codex/OpenCode/Pi uninstall via filesystem mirrors
  // ---------------------------------------------------------------------------

describe("removeCavemanCopies — W1.4 filesystem mirrors", () => {
  async function writeCavemanMirrorMarker(): Promise<void> {
    await mkdir(join(TMP, ".fulcrum", "state", "global"), { recursive: true });
    await writeFile(join(TMP, ".fulcrum", "state", "global", "caveman-mirrors.installed"), "installed\n");
  }

  test("does not call npx skills remove caveman; removes marked per-agent mirrors", async () => {
    await writeCavemanMirrorMarker();
    await mkdir(join(TMP, ".codex", "skills", "caveman"), { recursive: true });
    await mkdir(join(TMP, ".codex", "plugins", "cache", "caveman", "caveman", "0.1.0"), { recursive: true });
    await mkdir(join(TMP, ".codex", "plugins", "cache", "caveman", "caveman", "0.1.0", "package", ".codex"), { recursive: true });
    await writeFile(
      join(TMP, ".codex", "plugins", "cache", "caveman", "caveman", "0.1.0", "package", ".codex", "hooks.json"),
      JSON.stringify({ hooks: { UserPromptSubmit: [{ command: "hooks/caveman-activate.js" }] } }, null, 2) + "\n",
    );
    await writeFile(
      join(TMP, ".codex", "config.toml"),
      [
        "[features]",
        "codex_hooks = true",
        "",
        "[marketplaces.caveman]",
        'source_type = "git"',
        'source = "https://github.com/JuliusBrussee/caveman"',
        "",
        '[plugins."caveman@caveman"]',
        "enabled = true",
        "",
      ].join("\n"),
    );
    await writeFile(
      join(TMP, ".codex", "hooks.json"),
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            { command: "hooks/caveman-activate.js" },
            { command: "user-owned-hook" },
          ],
        },
      }, null, 2) + "\n",
    );
    await mkdir(join(TMP, ".config", "opencode", "skills", "caveman"), { recursive: true });
    await mkdir(join(TMP, ".config", "opencode", "packages", "caveman", "commands"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent", "skills", "caveman"), { recursive: true });
    await mkdir(join(TMP, ".pi", "agent", "packages", "caveman", "hooks"), { recursive: true });

    const whichSpy = spyOn(proc, "which").mockImplementation(async (cmd: string) => {
      if (cmd === "npx") return "/usr/local/bin/npx";
      return null;
    });
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });

    try {
      await run(["--include-caveman"]);
      const calls = runSpy.mock.calls.map((c) => c[0]);
      const npxRemovals = calls.filter(
        (cmd) => Array.isArray(cmd) && cmd[0] === "npx" && cmd.includes("remove") && cmd.includes("caveman"),
      );
      expect(npxRemovals.length).toBe(0);
      expect(await Bun.file(join(TMP, ".codex", "skills", "caveman")).exists()).toBe(false);
      expect(await Bun.file(join(TMP, ".codex", "plugins", "cache", "caveman")).exists()).toBe(false);
      expect(await Bun.file(join(TMP, ".config", "opencode", "packages", "caveman")).exists()).toBe(false);
      expect(await Bun.file(join(TMP, ".pi", "agent", "packages", "caveman")).exists()).toBe(false);
      expect(await Bun.file(join(TMP, ".config", "opencode", "skills", "caveman")).exists()).toBe(false);
      expect(await Bun.file(join(TMP, ".pi", "agent", "skills", "caveman")).exists()).toBe(false);
      expect(await readFile(join(TMP, ".codex", "config.toml"), "utf8")).not.toContain("caveman");
      const hooks = JSON.parse(await readFile(join(TMP, ".codex", "hooks.json"), "utf8"));
      expect(hooks.hooks.UserPromptSubmit).toEqual([{ command: "user-owned-hook" }]);
      expect(await Bun.file(join(TMP, ".fulcrum", "state", "global", "caveman-mirrors.installed")).exists()).toBe(false);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
  });

  test("preserves unmarked user-owned caveman-looking mirror dirs", async () => {
    await mkdir(join(TMP, ".codex", "skills", "caveman"), { recursive: true });
    await writeFile(join(TMP, ".codex", "skills", "caveman", "SKILL.md"), "user-owned\n");
    await mkdir(join(TMP, ".config", "opencode", "packages", "caveman"), { recursive: true });
    await writeFile(join(TMP, ".config", "opencode", "packages", "caveman", "README.md"), "user-owned\n");
    await mkdir(join(TMP, ".codex", "plugins", "cache", "caveman", "caveman", "0.1.0"), { recursive: true });
    await writeFile(join(TMP, ".codex", "plugins", "cache", "caveman", "caveman", "0.1.0", "README.md"), "user-owned\n");

    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });

    try {
      await run(["--include-caveman"]);
      const calls = runSpy.mock.calls.map((c) => c[0]);
      const npxCall = calls.find(
        (cmd) => Array.isArray(cmd) && cmd[0] === "npx",
      );
      expect(npxCall).toBeUndefined();
      expect(await readFile(join(TMP, ".codex", "skills", "caveman", "SKILL.md"), "utf8")).toBe("user-owned\n");
      expect(await readFile(join(TMP, ".config", "opencode", "packages", "caveman", "README.md"), "utf8")).toBe("user-owned\n");
      expect(await readFile(join(TMP, ".codex", "plugins", "cache", "caveman", "caveman", "0.1.0", "README.md"), "utf8")).toBe("user-owned\n");
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
  });

  test("falls back to removePath when npx not on PATH and Fulcrum marker exists", async () => {
    await writeCavemanMirrorMarker();
    await mkdir(join(TMP, ".codex", "skills", "caveman"), { recursive: true });

    const whichSpy = spyOn(proc, "which").mockResolvedValue(null);
    const runSpy = spyOn(proc, "run").mockResolvedValue({ exit: 0, stdout: "", stderr: "" });

    try {
      await run(["--include-caveman"]);
      const calls = runSpy.mock.calls.map((c) => c[0]);
      const npxCall = calls.find(
        (cmd) => Array.isArray(cmd) && cmd[0] === "npx",
      );
      expect(npxCall).toBeUndefined();
      expect(await Bun.file(join(TMP, ".codex", "skills", "caveman")).exists()).toBe(false);
    } finally {
      whichSpy.mockRestore();
      runSpy.mockRestore();
    }
  });
});
