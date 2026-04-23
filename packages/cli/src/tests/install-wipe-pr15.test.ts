/**
 * PR 15 — `fulcrum install wipe` TDD test suite.
 *
 * Coverage: configured agents × (dry-run + live + idempotent-rerun).
 * Each test sets up a minimal fake FS tree, calls wipeAgent(), and asserts:
 *   - correct files removed / skipped
 *   - shared config files surgically patched (not deleted)
 *   - dry-run produces zero FS mutations
 *   - second run is a no-op (idempotent)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { wipeAgent } from "../../../../agent-integration/wipe.js";

// ── helpers ────────────────────────────────────────────────────────────────────

function mktemp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wipe-test-"));
}

function mkfile(filePath: string, content = "x"): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function mkdirp(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function exists(p: string): boolean {
  return fs.existsSync(p);
}

function read(p: string): string {
  return fs.readFileSync(p, "utf8");
}

function wipeProject(opts: Omit<Parameters<typeof wipeAgent>[0], "scope">) {
  return wipeAgent({ ...opts, scope: "project" });
}

// ── cursor (project-scoped) ────────────────────────────────────────────────────

describe("wipeAgent cursor", () => {
  let dir: string;

  beforeEach(() => {
    dir = mktemp();
    // fulcrum-managed files
    mkfile(path.join(dir, ".cursor/rules/fulcrum-core.mdc"), "rules");
    mkfile(path.join(dir, ".cursor/rules/fulcrum-skill-foo.mdc"), "skill");
    mkfile(path.join(dir, ".cursor/skills/fulcrum-foo/SKILL.md"), "skill");
    mkfile(path.join(dir, ".cursor/commands/fulcrum-recall.md"), "cmd");
    // shared files with fulcrum content
    mkfile(path.join(dir, ".cursor/mcp.json"), JSON.stringify({ mcpServers: { fulcrum: { command: "fulcrum", args: [] }, other: { command: "other" } } }));
    mkfile(path.join(dir, ".cursor/hooks.json"), JSON.stringify({ hooks: [{ event: "start", command: "fulcrum hook cursor" }, { event: "end", command: "user-hook" }] }));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("dry-run: reports actions but makes no changes", () => {
    const result = wipeProject({ agent: "cursor", dryRun: true, targetDir: dir });
    expect(result.dryRun).toBe(true);
    expect(result.actions.length).toBeGreaterThan(0);
    // all fulcrum files still present after dry-run
    expect(exists(path.join(dir, ".cursor/rules/fulcrum-core.mdc"))).toBe(true);
    expect(exists(path.join(dir, ".cursor/mcp.json"))).toBe(true);
  });

  it("wipes exclusive fulcrum files", () => {
    wipeProject({ agent: "cursor", dryRun: false, targetDir: dir });
    expect(exists(path.join(dir, ".cursor/rules/fulcrum-core.mdc"))).toBe(false);
    expect(exists(path.join(dir, ".cursor/rules/fulcrum-skill-foo.mdc"))).toBe(false);
    expect(exists(path.join(dir, ".cursor/skills/fulcrum-foo/SKILL.md"))).toBe(false);
    expect(exists(path.join(dir, ".cursor/commands/fulcrum-recall.md"))).toBe(false);
  });

  it("strips fulcrum key from shared mcp.json, preserves other entries", () => {
    wipeProject({ agent: "cursor", dryRun: false, targetDir: dir });
    expect(exists(path.join(dir, ".cursor/mcp.json"))).toBe(true);
    const mcp = JSON.parse(read(path.join(dir, ".cursor/mcp.json")));
    expect(mcp.mcpServers.fulcrum).toBeUndefined();
    expect(mcp.mcpServers.other).toBeDefined();
  });

  it("strips fulcrum hooks from shared hooks.json, preserves other hooks", () => {
    wipeProject({ agent: "cursor", dryRun: false, targetDir: dir });
    expect(exists(path.join(dir, ".cursor/hooks.json"))).toBe(true);
    const hooksJson = JSON.parse(read(path.join(dir, ".cursor/hooks.json")));
    const cmds = hooksJson.hooks.map((h: { command: string }) => h.command);
    expect(cmds.some((c: string) => c.includes("fulcrum"))).toBe(false);
    expect(cmds).toContain("user-hook");
  });

  it("is idempotent — second run is a no-op", () => {
    wipeProject({ agent: "cursor", dryRun: false, targetDir: dir });
    const result2 = wipeProject({ agent: "cursor", dryRun: false, targetDir: dir });
    expect(result2.wiped).toBe(0);
  });

  it("result contains agent name and action list", () => {
    const result = wipeProject({ agent: "cursor", dryRun: false, targetDir: dir });
    expect(result.agent).toBe("cursor");
    expect(Array.isArray(result.actions)).toBe(true);
  });
});

// ── windsurf (project-scoped) ─────────────────────────────────────────────────

describe("wipeAgent windsurf", () => {
  let dir: string;

  beforeEach(() => {
    dir = mktemp();
    mkfile(path.join(dir, ".windsurf/rules/fulcrum-core.md"), "rules");
    mkfile(path.join(dir, ".windsurf/rules/fulcrum-skill-foo.md"), "skill");
    mkfile(path.join(dir, ".windsurf/workflows/fulcrum-recall.md"), "wf");
    mkfile(path.join(dir, ".windsurf/mcp.json"), JSON.stringify({ mcpServers: { fulcrum: { command: "fulcrum" } } }));
    mkfile(path.join(dir, ".windsurf/hooks.json"), JSON.stringify({ hooks: [] }));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("dry-run makes no changes", () => {
    wipeProject({ agent: "windsurf", dryRun: true, targetDir: dir });
    expect(exists(path.join(dir, ".windsurf/rules/fulcrum-core.md"))).toBe(true);
  });

  it("wipes exclusive fulcrum files", () => {
    wipeProject({ agent: "windsurf", dryRun: false, targetDir: dir });
    expect(exists(path.join(dir, ".windsurf/rules/fulcrum-core.md"))).toBe(false);
    expect(exists(path.join(dir, ".windsurf/rules/fulcrum-skill-foo.md"))).toBe(false);
    expect(exists(path.join(dir, ".windsurf/workflows/fulcrum-recall.md"))).toBe(false);
  });

  it("strips fulcrum from mcp.json — deletes file if only fulcrum remained", () => {
    wipeProject({ agent: "windsurf", dryRun: false, targetDir: dir });
    // file had only fulcrum entry → file removed
    expect(exists(path.join(dir, ".windsurf/mcp.json"))).toBe(false);
  });

  it("is idempotent", () => {
    wipeProject({ agent: "windsurf", dryRun: false, targetDir: dir });
    const r2 = wipeProject({ agent: "windsurf", dryRun: false, targetDir: dir });
    expect(r2.wiped).toBe(0);
  });
});

// ── codex (global-scoped) ─────────────────────────────────────────────────────

describe("wipeAgent codex", () => {
  let home: string;

  beforeEach(() => {
    home = mktemp();
    // config.toml with fulcrum MCP section + hook entries
    const toml = [
      "[user]",
      'name = "alice"',
      "",
      "[mcp_servers.fulcrum]",
      'command = "fulcrum"',
      'args = ["serve", "mcp"]',
      "",
      "[[hooks]]",
      'event = "SessionStart"',
      'command = "fulcrum hook codex session-start"',
      "",
      "[[hooks]]",
      'event = "PreToolUse"',
      'command = "other-hook"',
    ].join("\n");
    mkfile(path.join(home, ".codex/config.toml"), toml);
    mkfile(path.join(home, ".codex/skills/fulcrum-foo/SKILL.md"), "skill");
    mkfile(path.join(home, ".codex/rules/fulcrum-rule-core.md"), "rule");
    mkfile(path.join(home, ".codex/rules/fulcrum-rule-roles.md"), "rule2");
  });

  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("dry-run makes no changes", () => {
    wipeAgent({ agent: "codex", dryRun: true, home });
    expect(read(path.join(home, ".codex/config.toml"))).toContain("[mcp_servers.fulcrum]");
  });

  it("strips [mcp_servers.fulcrum] section from config.toml", () => {
    wipeAgent({ agent: "codex", dryRun: false, home });
    const toml = read(path.join(home, ".codex/config.toml"));
    expect(toml).not.toContain("[mcp_servers.fulcrum]");
    expect(toml).toContain("[user]");
  });

  it("strips fulcrum hook entries from config.toml, preserves others", () => {
    wipeAgent({ agent: "codex", dryRun: false, home });
    const toml = read(path.join(home, ".codex/config.toml"));
    expect(toml).not.toContain("fulcrum hook codex");
    expect(toml).toContain("other-hook");
  });

  it("deletes fulcrum skills dirs", () => {
    wipeAgent({ agent: "codex", dryRun: false, home });
    expect(exists(path.join(home, ".codex/skills/fulcrum-foo"))).toBe(false);
  });

  it("deletes fulcrum rule files", () => {
    wipeAgent({ agent: "codex", dryRun: false, home });
    expect(exists(path.join(home, ".codex/rules/fulcrum-rule-core.md"))).toBe(false);
    expect(exists(path.join(home, ".codex/rules/fulcrum-rule-roles.md"))).toBe(false);
  });

  it("is idempotent", () => {
    wipeAgent({ agent: "codex", dryRun: false, home });
    const r2 = wipeAgent({ agent: "codex", dryRun: false, home });
    expect(r2.wiped).toBe(0);
  });
});

// ── opencode (project-scoped) ─────────────────────────────────────────────────

describe("wipeAgent opencode", () => {
  let dir: string;

  beforeEach(() => {
    dir = mktemp();
    mkfile(path.join(dir, ".opencode/opencode.md"), "ctx");
    mkfile(path.join(dir, ".opencode/plugins/fulcrum.ts"), "plugin");
    mkfile(path.join(dir, ".opencode/plugins/rider.ts"), "rider");
    mkfile(path.join(dir, ".opencode/command/fulcrum-recall.md"), "cmd");
    mkfile(path.join(dir, ".opencode/agents/fulcrum-skill-foo/AGENT.md"), "agent");
    // opencode.jsonc with fulcrum plugin line
    mkfile(path.join(dir, ".opencode/opencode.jsonc"), JSON.stringify({
      "$schema": "...",
      "plugin": ["@fulcrum-agent-os/opencode-plugin"],
      "theme": "dark",
    }));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("dry-run makes no changes", () => {
    wipeProject({ agent: "opencode", dryRun: true, targetDir: dir });
    expect(exists(path.join(dir, ".opencode/plugins/fulcrum.ts"))).toBe(true);
  });

  it("deletes exclusive plugin files", () => {
    wipeProject({ agent: "opencode", dryRun: false, targetDir: dir });
    expect(exists(path.join(dir, ".opencode/opencode.md"))).toBe(false);
    expect(exists(path.join(dir, ".opencode/plugins/fulcrum.ts"))).toBe(false);
    expect(exists(path.join(dir, ".opencode/plugins/rider.ts"))).toBe(false);
    expect(exists(path.join(dir, ".opencode/command/fulcrum-recall.md"))).toBe(false);
    expect(exists(path.join(dir, ".opencode/agents/fulcrum-skill-foo"))).toBe(false);
  });

  it("strips fulcrum plugin entry from opencode.jsonc, preserves other keys", () => {
    wipeProject({ agent: "opencode", dryRun: false, targetDir: dir });
    expect(exists(path.join(dir, ".opencode/opencode.jsonc"))).toBe(true);
    const cfg = JSON.parse(read(path.join(dir, ".opencode/opencode.jsonc")));
    const plugins: string[] = cfg.plugin ?? [];
    expect(plugins.some((p) => p.includes("fulcrum"))).toBe(false);
    expect(cfg.theme).toBe("dark");
  });

  it("is idempotent", () => {
    wipeProject({ agent: "opencode", dryRun: false, targetDir: dir });
    const r2 = wipeProject({ agent: "opencode", dryRun: false, targetDir: dir });
    expect(r2.wiped).toBe(0);
  });
});

// ── copilot (project-scoped) ──────────────────────────────────────────────────

describe("wipeAgent copilot", () => {
  let dir: string;

  beforeEach(() => {
    dir = mktemp();
    mkfile(path.join(dir, ".github/instructions/fulcrum-skill-foo.instructions.md"), "skill");
    mkfile(path.join(dir, ".github/agents/foo.agent.md"), "agent");
    mkfile(path.join(dir, ".github/hooks/fulcrum.json"), "{}");
    // shared files
    mkfile(path.join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { fulcrum: { command: "fulcrum" }, other: { command: "x" } } }));
    mkfile(path.join(dir, ".github/copilot-instructions.md"), "<!-- fulcrum:begin -->\nfulcrum stuff\n<!-- fulcrum:end -->\nuser content");
    mkfile(path.join(dir, "AGENTS.md"), "<!-- fulcrum:begin -->\nfulcrum\n<!-- fulcrum:end -->\nmy notes");
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("dry-run makes no changes", () => {
    wipeProject({ agent: "copilot", dryRun: true, targetDir: dir });
    expect(exists(path.join(dir, ".github/hooks/fulcrum.json"))).toBe(true);
  });

  it("deletes exclusive fulcrum files", () => {
    wipeProject({ agent: "copilot", dryRun: false, targetDir: dir });
    expect(exists(path.join(dir, ".github/instructions/fulcrum-skill-foo.instructions.md"))).toBe(false);
    expect(exists(path.join(dir, ".github/agents/foo.agent.md"))).toBe(false);
    expect(exists(path.join(dir, ".github/hooks/fulcrum.json"))).toBe(false);
  });

  it("strips fulcrum from .mcp.json, preserves other entries", () => {
    wipeProject({ agent: "copilot", dryRun: false, targetDir: dir });
    expect(exists(path.join(dir, ".mcp.json"))).toBe(true);
    const mcp = JSON.parse(read(path.join(dir, ".mcp.json")));
    expect(mcp.mcpServers.fulcrum).toBeUndefined();
    expect(mcp.mcpServers.other).toBeDefined();
  });

  it("strips marker block from copilot-instructions.md", () => {
    wipeProject({ agent: "copilot", dryRun: false, targetDir: dir });
    const content = read(path.join(dir, ".github/copilot-instructions.md"));
    expect(content).not.toContain("<!-- fulcrum:begin -->");
    expect(content).toContain("user content");
  });

  it("strips marker block from AGENTS.md, preserves user content", () => {
    wipeProject({ agent: "copilot", dryRun: false, targetDir: dir });
    const content = read(path.join(dir, "AGENTS.md"));
    expect(content).not.toContain("<!-- fulcrum:begin -->");
    expect(content).toContain("my notes");
  });

  it("is idempotent", () => {
    wipeProject({ agent: "copilot", dryRun: false, targetDir: dir });
    const r2 = wipeProject({ agent: "copilot", dryRun: false, targetDir: dir });
    expect(r2.wiped).toBe(0);
  });
});

// ── claude (global-scoped) ────────────────────────────────────────────────────

describe("wipeAgent claude", () => {
  let home: string;

  beforeEach(() => {
    home = mktemp();
    // Claude settings with hooks
    const settings = {
      hooks: {
        PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "fulcrum hook claude pre" }] }],
        SessionStart: [{ hooks: [{ type: "command", command: "fulcrum hook claude session-start" }] }],
      },
      mcpServers: {
        fulcrum: { command: "fulcrum", args: ["serve", "mcp"] },
        "other-mcp": { command: "other" },
      },
    };
    mkfile(path.join(home, ".claude/settings.json"), JSON.stringify(settings));
    mkfile(path.join(home, ".claude/CLAUDE.md"), "<!-- fulcrum:begin -->\nfulcrum content\n<!-- fulcrum:end -->\nmy notes");
    mkfile(path.join(home, ".claude/skills/fulcrum/foo.md"), "skill");
    mkfile(path.join(home, ".claude/agents/fulcrum-engineer.md"), "agent");
    mkfile(path.join(home, ".claude/commands/fulcrum-recall.md"), "cmd");
  });

  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("dry-run makes no changes", () => {
    wipeAgent({ agent: "claude", dryRun: true, home });
    expect(read(path.join(home, ".claude/settings.json"))).toContain("fulcrum hook claude");
  });

  it("strips fulcrum hooks from settings.json, preserves file", () => {
    wipeAgent({ agent: "claude", dryRun: false, home });
    const s = JSON.parse(read(path.join(home, ".claude/settings.json")));
    const preHooks = (s.hooks?.PreToolUse ?? []) as Array<{ hooks: Array<{ command: string }> }>;
    const allCmds = preHooks.flatMap(e => e.hooks.map((h: { command: string }) => h.command));
    expect(allCmds.some((c: string) => c.includes("fulcrum"))).toBe(false);
  });

  it("removes fulcrum from mcpServers in settings.json, preserves other", () => {
    wipeAgent({ agent: "claude", dryRun: false, home });
    const s = JSON.parse(read(path.join(home, ".claude/settings.json")));
    expect(s.mcpServers?.fulcrum).toBeUndefined();
    expect(s.mcpServers?.["other-mcp"]).toBeDefined();
  });

  it("strips marker block from CLAUDE.md, preserves user content", () => {
    wipeAgent({ agent: "claude", dryRun: false, home });
    const content = read(path.join(home, ".claude/CLAUDE.md"));
    expect(content).not.toContain("<!-- fulcrum:begin -->");
    expect(content).toContain("my notes");
  });

  it("deletes skills/fulcrum/ dir", () => {
    wipeAgent({ agent: "claude", dryRun: false, home });
    expect(exists(path.join(home, ".claude/skills/fulcrum"))).toBe(false);
  });

  it("deletes fulcrum agent MDs", () => {
    wipeAgent({ agent: "claude", dryRun: false, home });
    expect(exists(path.join(home, ".claude/agents/fulcrum-engineer.md"))).toBe(false);
  });

  it("deletes fulcrum commands", () => {
    wipeAgent({ agent: "claude", dryRun: false, home });
    expect(exists(path.join(home, ".claude/commands/fulcrum-recall.md"))).toBe(false);
  });

  it("is idempotent", () => {
    wipeAgent({ agent: "claude", dryRun: false, home });
    const r2 = wipeAgent({ agent: "claude", dryRun: false, home });
    expect(r2.wiped).toBe(0);
  });
});

// ── gemini (global-scoped) ────────────────────────────────────────────────────

describe("wipeAgent gemini", () => {
  let home: string;

  beforeEach(() => {
    home = mktemp();
    mkfile(path.join(home, ".gemini/extensions/fulcrum/extension.json"), "{}");
    mkfile(path.join(home, ".gemini/extensions/fulcrum/GEMINI.md"), "ctx");
    mkfile(path.join(home, ".gemini/extensions/other/extension.json"), "{}");
  });

  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("dry-run makes no changes", () => {
    wipeAgent({ agent: "gemini", dryRun: true, home });
    expect(exists(path.join(home, ".gemini/extensions/fulcrum"))).toBe(true);
  });

  it("deletes fulcrum extension dir", () => {
    wipeAgent({ agent: "gemini", dryRun: false, home });
    expect(exists(path.join(home, ".gemini/extensions/fulcrum"))).toBe(false);
  });

  it("preserves other extension dirs", () => {
    wipeAgent({ agent: "gemini", dryRun: false, home });
    expect(exists(path.join(home, ".gemini/extensions/other"))).toBe(true);
  });

  it("is idempotent", () => {
    wipeAgent({ agent: "gemini", dryRun: false, home });
    const r2 = wipeAgent({ agent: "gemini", dryRun: false, home });
    expect(r2.wiped).toBe(0);
  });
});

// ── qwen (global-scoped) ──────────────────────────────────────────────────────

describe("wipeAgent qwen", () => {
  let home: string;

  beforeEach(() => {
    home = mktemp();
    mkfile(path.join(home, ".qwen/extensions/fulcrum/qwen-extension.json"), "{}");
    mkfile(path.join(home, ".qwen/extensions/other/qwen-extension.json"), "{}");
  });

  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("deletes fulcrum extension dir", () => {
    wipeAgent({ agent: "qwen", dryRun: false, home });
    expect(exists(path.join(home, ".qwen/extensions/fulcrum"))).toBe(false);
    expect(exists(path.join(home, ".qwen/extensions/other"))).toBe(true);
  });
});

// ── pi (global-scoped) ────────────────────────────────────────────────────────

describe("wipeAgent pi", () => {
  let home: string;

  beforeEach(() => {
    home = mktemp();
    // PI stores cockpit package in ~/.pi/packages/ or similar
    mkfile(path.join(home, ".pi/packages/@fulcrum-agent-os/pi-cockpit/index.ts"), "x");
    mkfile(path.join(home, ".pi/packages/other-pkg/index.ts"), "x");
  });

  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("dry-run makes no changes", () => {
    wipeAgent({ agent: "pi", dryRun: true, home });
    expect(exists(path.join(home, ".pi/packages/@fulcrum-agent-os/pi-cockpit"))).toBe(true);
  });

  it("deletes pi-cockpit package dir", () => {
    wipeAgent({ agent: "pi", dryRun: false, home });
    expect(exists(path.join(home, ".pi/packages/@fulcrum-agent-os/pi-cockpit"))).toBe(false);
  });

  it("preserves other pi packages", () => {
    wipeAgent({ agent: "pi", dryRun: false, home });
    expect(exists(path.join(home, ".pi/packages/other-pkg"))).toBe(true);
  });

  it("is idempotent", () => {
    wipeAgent({ agent: "pi", dryRun: false, home });
    const r2 = wipeAgent({ agent: "pi", dryRun: false, home });
    expect(r2.wiped).toBe(0);
  });
});

// ── WipeResult shape ──────────────────────────────────────────────────────────

describe("WipeResult shape", () => {
  it("has required fields", () => {
    const dir = mktemp();
    const result = wipeProject({ agent: "cursor", dryRun: true, targetDir: dir });
    expect(typeof result.agent).toBe("string");
    expect(typeof result.dryRun).toBe("boolean");
    expect(Array.isArray(result.actions)).toBe(true);
    expect(typeof result.wiped).toBe("number");
    expect(typeof result.skipped).toBe("number");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// ── default safety ───────────────────────────────────────────────────────────

describe("wipeAgent project-scope safety", () => {
  it("does not touch project-local files unless scope=project is explicit", () => {
    const dir = mktemp();
    try {
      mkfile(path.join(dir, ".github/hooks/fulcrum.json"), "{}");
      mkfile(path.join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { fulcrum: { command: "fulcrum" } } }));
      mkfile(path.join(dir, "AGENTS.md"), "<!-- fulcrum:begin -->\nfulcrum\n<!-- fulcrum:end -->\nnotes");

      const result = wipeAgent({ agent: "copilot", dryRun: false, targetDir: dir });

      expect(result.wiped).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.actions[0]?.reason).toContain("project-local wipe disabled");
      expect(exists(path.join(dir, ".github/hooks/fulcrum.json"))).toBe(true);
      expect(exists(path.join(dir, ".mcp.json"))).toBe(true);
      expect(read(path.join(dir, "AGENTS.md"))).toContain("fulcrum");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
