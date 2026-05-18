import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  applyBuiltinMcpDefaultState,
  assertNotAgentsPath,
  installCaveman,
  installMcpRegistryEntries,
  installRulesBlocks,
  installToolOutputPolicy,
  lockCavemanUltra,
  run as runInstall,
  setDryRun as setInstallDryRun,
  spliceSentinel,
  stripVendorRuleBlocks,
} from "../../apps/cli/src/install.ts";
import {
  removeExactLine,
  removeCavemanCopies,
  removeRulesBlocks,
  removeSentinelBlock,
  removeToolOutputPolicy,
  run as runUninstall,
  setDryRun as setUninstallDryRun,
} from "../../apps/cli/src/uninstall.ts";
import { writeMarker } from "../../apps/cli/src/claude-plugin-markers.ts";

const BEGIN = "<!-- BEGIN FULCRUM RULES -->";
const END = "<!-- END FULCRUM RULES -->";

let scratch: string;
let previousHome: string | undefined;
let previousFulcrumHome: string | undefined;
let previousRepoDir: string | undefined;
let previousXdgConfigHome: string | undefined;

async function text(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function captureLogs(fn: () => Promise<void>): Promise<string[]> {
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => { logs.push(args.join(" ")); };
  console.error = (...args: unknown[]) => { logs.push(args.join(" ")); };
  try {
    await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
  return logs;
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-install-source-"));
  previousHome = process.env["HOME"];
  previousFulcrumHome = process.env["FULCRUM_HOME"];
  previousRepoDir = process.env["FULCRUM_REPO_DIR"];
  previousXdgConfigHome = process.env["XDG_CONFIG_HOME"];
  process.env["HOME"] = join(scratch, "home");
  process.env["FULCRUM_HOME"] = join(scratch, "fulcrum-home");
  process.env["FULCRUM_REPO_DIR"] = process.cwd();
  delete process.env["XDG_CONFIG_HOME"];
  await mkdir(process.env["HOME"]!, { recursive: true });
});

afterEach(async () => {
  setInstallDryRun(false);
  setUninstallDryRun(false);
  if (previousHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = previousHome;
  if (previousFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = previousFulcrumHome;
  if (previousRepoDir === undefined) delete process.env["FULCRUM_REPO_DIR"];
  else process.env["FULCRUM_REPO_DIR"] = previousRepoDir;
  if (previousXdgConfigHome === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = previousXdgConfigHome;
  await rm(scratch, { recursive: true, force: true });
});

describe("install source helpers", () => {
  it("appends and replaces Fulcrum sentinel blocks without touching user text", async () => {
    const target = join(scratch, "rules.md");
    await writeFile(target, "user intro\n");

    await spliceSentinel(target, "first body", "Test Agent");
    expect(await text(target)).toBe(`user intro\n\n${BEGIN}\nfirst body\n${END}\n`);

    await spliceSentinel(target, "second body", "Test Agent");
    expect(await text(target)).toBe(`user intro\n\n${BEGIN}\nsecond body\n${END}\n`);
  });

  it("refuses ambiguous sentinel marker counts", async () => {
    const target = join(scratch, "ambiguous.md");
    await writeFile(target, `${BEGIN}\none\n${END}\n${BEGIN}\ntwo\n${END}\n`);

    const logs = await captureLogs(() => spliceSentinel(target, "new body", "Test Agent"));

    expect(logs.join("\n")).toContain("refused");
    expect(await text(target)).toContain("two");
  });

  it("strips known vendor rule blocks only outside the Fulcrum sentinel", async () => {
    // VENDOR_RULE_HEADINGS is currently empty (graphify removed); verify that
    // the sentinel-split logic is sound: content inside the managed block is
    // preserved and user content outside is untouched.
    const target = join(scratch, "agent.md");
    const originalContent = [
      "outside user content",
      "",
      `${BEGIN}`,
      "inside managed block",
      `${END}`,
      "",
      "# user heading",
      "keep me",
      "",
    ].join("\n");
    await writeFile(target, originalContent);

    await stripVendorRuleBlocks(target, false);
    const result = await text(target);

    // No vendor headings registered → nothing stripped, file unchanged.
    expect(result).toContain("outside user content");
    expect(result).toContain("inside managed block");
    expect(result).toContain("# user heading");
  });

  it("leaves rule files unchanged when vendor blocks are absent or only previewed", async () => {
    const missing = join(scratch, "missing.md");
    await stripVendorRuleBlocks(missing, false);

    const noVendor = join(scratch, "plain.md");
    await writeFile(noVendor, "# user heading\nkeep me\n");
    await stripVendorRuleBlocks(noVendor, false);
    expect(await text(noVendor)).toBe("# user heading\nkeep me\n");

    // Dry-run on a missing file is a no-op — the function returns early and
    // logs nothing (no vendor headings registered to detect changes).
    const dryRunTarget = join(scratch, "dry-run-vendor.md");
    const logs = await captureLogs(() => stripVendorRuleBlocks(dryRunTarget, true));
    expect(logs.join("\n")).toBe("");
  });

  it("guards the shared ~/.agents path and seeds tool-output policy idempotently", async () => {
    expect(() => assertNotAgentsPath(join(process.env["HOME"]!, ".agents", "x"), process.env["HOME"]!)).toThrow("HARD RULE VIOLATION");
    expect(() => assertNotAgentsPath(join(process.env["HOME"]!, ".agents"), process.env["HOME"]!)).toThrow("HARD RULE VIOLATION");
    expect(() => assertNotAgentsPath(join(process.env["HOME"]!, ".codex", "skills"), process.env["HOME"]!)).not.toThrow();
    expect(() => assertNotAgentsPath(join(process.env["HOME"]!, ".agents2", "x"), process.env["HOME"]!)).not.toThrow();

    const dryRunLogs = await captureLogs(() => installToolOutputPolicy(true));
    expect(dryRunLogs.join("\n")).toContain("would copy");
    await expect(readFile(join(process.env["FULCRUM_HOME"]!, "tool-output-policy.toml"), "utf8")).rejects.toThrow();

    await installToolOutputPolicy(false);
    const seeded = await text(join(process.env["FULCRUM_HOME"]!, "tool-output-policy.toml"));
    expect(seeded).toContain("[default]");

    await writeFile(join(process.env["FULCRUM_HOME"]!, "tool-output-policy.toml"), "custom = true\n");
    await installToolOutputPolicy(false);
    expect(await text(join(process.env["FULCRUM_HOME"]!, "tool-output-policy.toml"))).toBe("custom = true\n");
  });

  it("previews rule splicing without creating agent files", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".gemini"), { recursive: true });

    const logs = await captureLogs(() => installRulesBlocks(home, true));
    const output = logs.join("\n");

    expect(output).toContain("would write");
    expect(output).toContain("Gemini GEMINI.md updated with @AGENTS.md import");
    await expect(readFile(join(home, ".codex", "AGENTS.md"), "utf8")).rejects.toThrow();
    await expect(readFile(join(home, "AGENTS.md"), "utf8")).rejects.toThrow();
    await expect(readFile(join(home, ".gemini", "GEMINI.md"), "utf8")).rejects.toThrow();
  });

  it("installs only Gemini source when other agent dirs are absent and keeps existing Gemini import single", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".gemini"), { recursive: true });
    await writeFile(join(home, ".gemini", "GEMINI.md"), "user settings\n@AGENTS.md\n");

    const logs = await captureLogs(() => installRulesBlocks(home, false));
    const output = logs.join("\n");

    expect(output).toContain("skip Claude Code");
    expect(output).toContain("skip Codex CLI");
    expect(await text(join(home, "AGENTS.md"))).toContain(BEGIN);
    expect(await text(join(home, ".gemini", "GEMINI.md"))).toBe("user settings\n@AGENTS.md\n");
    await expect(readFile(join(home, ".codex", "AGENTS.md"), "utf8")).rejects.toThrow();
  });

  it("fails rule install clearly when the repo rules source is missing", async () => {
    const missingRepo = join(scratch, "missing-repo");
    process.env["FULCRUM_REPO_DIR"] = missingRepo;

    await expect(installRulesBlocks(process.env["HOME"]!, false)).rejects.toThrow(
      `fulcrum install: cannot find ${join(missingRepo, "rules", "AGENTS.md")}`,
    );
  });

  it("installs rules into detected agent homes and Gemini import shim", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".gemini"), { recursive: true });
    await writeFile(join(home, ".codex", "AGENTS.md"), "codex user\n");

    await installRulesBlocks(home, false);

    expect(await text(join(home, ".codex", "AGENTS.md"))).toContain(BEGIN);
    expect(await text(join(home, "AGENTS.md"))).toContain(BEGIN);
    expect(await text(join(home, ".gemini", "GEMINI.md"))).toContain("@AGENTS.md");
  });

  it("locks caveman config to ultra and preserves owned-key TOML style JSON ownership", async () => {
    const home = process.env["HOME"]!;
    const cfg = join(home, ".config", "caveman", "config.json");

    await lockCavemanUltra(home);
    expect(JSON.parse(await text(cfg))).toEqual({ defaultMode: "ultra" });

    await writeFile(cfg, JSON.stringify({ defaultMode: "full", __fulcrum_owned_keys: ["defaultMode"], other: true }, null, 2));
    await lockCavemanUltra(home);
    const parsed = JSON.parse(await text(cfg));
    expect(parsed.defaultMode).toBe("ultra");
    expect(parsed.other).toBe(true);
  });

  it("locks caveman config under XDG_CONFIG_HOME, handles malformed JSON, and skips existing ultra", async () => {
    const home = process.env["HOME"]!;
    const xdg = join(scratch, "xdg");
    process.env["XDG_CONFIG_HOME"] = xdg;
    const cfg = join(xdg, "caveman", "config.json");
    await mkdir(join(xdg, "caveman"), { recursive: true });
    await writeFile(cfg, "{not json");

    await lockCavemanUltra(home);
    expect(JSON.parse(await text(cfg))).toEqual({ defaultMode: "ultra" });

    const logs = await captureLogs(() => lockCavemanUltra(home));
    expect(logs.join("\n")).toContain("already 'ultra'");
    expect(JSON.parse(await text(cfg))).toEqual({ defaultMode: "ultra" });
  });

  it("honors dry-run when locking caveman config", async () => {
    const home = process.env["HOME"]!;
    const cfg = join(home, ".config", "caveman", "config.json");
    setInstallDryRun(true);

    const logs = await captureLogs(() => lockCavemanUltra(home));

    expect(logs.join("\n")).toContain("would mkdir");
    expect(logs.join("\n")).toContain("would write");
    await expect(readFile(cfg, "utf8")).rejects.toThrow();
  });

  it("previews Caveman fallback installs across detected agent homes without mutating existing config", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".config", "opencode"), { recursive: true });
    await mkdir(join(home, ".pi", "agent"), { recursive: true });
    await mkdir(join(home, ".config", "caveman"), { recursive: true });
    const configPath = join(home, ".config", "caveman", "config.json");
    await writeFile(configPath, JSON.stringify({ defaultMode: "full", custom: true }, null, 2));

    const logs = await captureLogs(() => installCaveman(home, { dryRun: true }));
    const output = logs.join("\n");

    expect(output).toContain("skip Claude Code (not detected)");
    expect(output).toContain("skip Gemini CLI (not detected)");
    expect(output).toContain("would run: git clone --depth 1 https://github.com/JuliusBrussee/caveman");
    expect(output).toContain("Codex CLI caveman installed from official repo");
    expect(output).toContain("OpenCode caveman installed from official repo");
    expect(output).toContain("Pi CLI caveman installed from official repo");
    expect(output).toContain("caveman defaultMode set to 'ultra'");
    expect(JSON.parse(await text(configPath))).toEqual({ defaultMode: "full", custom: true });
  });

  it("installs Caveman mirrors from an existing source cache into detected agent homes", async () => {
    const home = process.env["HOME"]!;
    const cacheRoot = join(process.env["FULCRUM_HOME"]!, "cache", "caveman");
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".config", "opencode"), { recursive: true });
    await mkdir(join(home, ".pi", "agent"), { recursive: true });
    await mkdir(join(cacheRoot, "skills", "caveman"), { recursive: true });
    await mkdir(join(cacheRoot, "skills", "compress"), { recursive: true });
    await mkdir(join(cacheRoot, "plugins", "caveman", ".codex-plugin"), { recursive: true });
    await mkdir(join(cacheRoot, "plugins", "caveman", "package", ".codex"), { recursive: true });
    await mkdir(join(cacheRoot, ".codex"), { recursive: true });
    await mkdir(join(cacheRoot, "plugins", "caveman", "package", "tests"), { recursive: true });
    await writeFile(join(cacheRoot, "skills", "caveman", "SKILL.md"), "---\nname: caveman\n---\n");
    await writeFile(join(cacheRoot, "skills", "compress", "SKILL.md"), "---\nname: compress\n---\n");
    await writeFile(join(cacheRoot, "plugins", "caveman", ".codex-plugin", "plugin.json"), JSON.stringify({ version: "0.1.0" }));
    await writeFile(
      join(cacheRoot, "plugins", "caveman", "package", ".codex", "hooks.json"),
      JSON.stringify({ hooks: { PostToolUse: [{ command: "caveman compress" }] } }),
    );
    await writeFile(join(cacheRoot, ".codex", "hooks.json"), JSON.stringify({ hooks: { PostToolUse: [{ command: "caveman compress" }] } }));
    await writeFile(join(cacheRoot, "plugins", "caveman", "package", "README.md"), "package payload\n");
    await writeFile(join(cacheRoot, "plugins", "caveman", "package", "tests", "fixture.txt"), "excluded\n");

    await installCaveman(home);

    expect(await text(join(home, ".codex", "skills", "caveman", "SKILL.md"))).toContain("name: caveman");
    expect(await text(join(home, ".config", "opencode", "skills", "compress", "SKILL.md"))).toContain("name: compress");
    expect(await text(join(home, ".pi", "agent", "skills", "caveman", "SKILL.md"))).toContain("name: caveman");
    expect(await text(join(home, ".codex", "plugins", "cache", "caveman", "caveman", "0.1.0", "package", "plugins", "caveman", "package", "README.md"))).toContain("package payload");
    await expect(readFile(join(home, ".codex", "plugins", "cache", "caveman", "caveman", "0.1.0", "package", "plugins", "caveman", "package", "tests", "fixture.txt"), "utf8")).rejects.toThrow();
    expect(await text(join(home, ".codex", "config.toml"))).toContain("[plugins.\"caveman@caveman\"]");
    expect(await text(join(home, ".codex", "hooks.json"))).toContain("caveman compress");
    expect(JSON.parse(await text(join(home, ".config", "opencode", "packages", "caveman", ".fulcrum-unsupported.json"))).agent).toBe("opencode");
    expect(JSON.parse(await text(join(home, ".config", "caveman", "config.json"))).defaultMode).toBe("ultra");
    expect(await text(join(process.env["FULCRUM_HOME"]!, "state", "global", "caveman-mirrors.installed"))).toContain("T");

    const logs = await captureLogs(() => installCaveman(home));
    expect(logs.join("\n")).toContain("skip Codex CLI caveman (already installed)");
    expect(logs.join("\n")).toContain("skip OpenCode caveman (already installed)");
    expect(logs.join("\n")).toContain("skip Pi CLI caveman (already installed)");
  });

  it("merges Codex Caveman plugin config and hooks over existing user config truthfully", async () => {
    const home = process.env["HOME"]!;
    const cacheRoot = join(process.env["FULCRUM_HOME"]!, "cache", "caveman");
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(cacheRoot, "skills", "caveman"), { recursive: true });
    await mkdir(join(cacheRoot, "plugins", "caveman", ".codex-plugin"), { recursive: true });
    await mkdir(join(cacheRoot, "plugins", "caveman", "package", ".codex"), { recursive: true });
    await mkdir(join(cacheRoot, ".codex"), { recursive: true });
    await writeFile(join(cacheRoot, "skills", "caveman", "SKILL.md"), "---\nname: caveman\n---\n");
    await writeFile(join(cacheRoot, "plugins", "caveman", ".codex-plugin", "plugin.json"), JSON.stringify({ version: "0.2.0" }));
    await writeFile(join(cacheRoot, "plugins", "caveman", "package", ".codex", "hooks.json"), JSON.stringify({ hooks: { PostToolUse: [{ command: "caveman compress" }] } }));
    await writeFile(
      join(cacheRoot, ".codex", "hooks.json"),
      JSON.stringify({ hooks: { PostToolUse: [{ command: "caveman compress" }, { command: "keep-source" }], Stop: "not-array" } }),
    );
    await writeFile(join(home, ".codex", "config.toml"), "[features]\nexisting = true\n");
    await writeFile(join(home, ".codex", "hooks.json"), "{malformed");

    await installCaveman(home);

    const config = await text(join(home, ".codex", "config.toml"));
    expect(config).toContain('fulcrum_owned_keys = ["features.codex_hooks"]');
    expect(config).toContain("codex_hooks = true");
    expect(config).toContain("[plugins.\"caveman@caveman\"]");
    expect(config).toContain("[marketplaces.caveman]");
    expect(config).toContain("[features]\ncodex_hooks = true\nexisting = true");
    const hooks = JSON.parse(await text(join(home, ".codex", "hooks.json")));
    expect(hooks.hooks.PostToolUse).toEqual([{ command: "caveman compress" }, { command: "keep-source" }]);
    expect(await text(join(home, ".codex", "plugins", "cache", "caveman", "caveman", "0.2.0", "package", "plugins", "caveman", "package", ".codex", "hooks.json"))).toContain("caveman compress");
  });

  it("previews builtin MCP registration and default-state modes without writing registry state", async () => {
    const home = process.env["HOME"]!;
    setInstallDryRun(true);

    const logs = await captureLogs(async () => {
      await installMcpRegistryEntries(home);
      await applyBuiltinMcpDefaultState("minimal");
      await applyBuiltinMcpDefaultState("none");
    });
    const output = logs.join("\n");

    expect(output).toContain("would register");
    expect(output).toContain("would enable");
    expect(output).toContain("default MCP enable step skipped");
  });

  it("runs install dry-run parser paths for rules-only profile and MCP conflicts", async () => {
    const dryRunLogs = await captureLogs(() => runInstall(["--dry-run", "--profile", "rules-only", "--no-default-mcps"]));
    expect(dryRunLogs.join("\n")).toContain("(dry-run mode");
    expect(dryRunLogs.join("\n")).toContain("Installing component profile profile.rules-only");
    expect(dryRunLogs.join("\n")).toContain("default MCP enable step skipped (--profile rules-only)");

    const originalExit = process.exit;
    process.exit = ((code?: string | number | null | undefined) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as typeof process.exit;
    try {
      await expect(runInstall(["--no-default-mcps", "--enable-all-mcps"])).rejects.toThrow("process.exit(2)");
      await expect(runInstall(["--profile", "invalid"])).rejects.toThrow("process.exit(2)");
    } finally {
      process.exit = originalExit;
    }
  });

  it("runs install twice idempotently and previews uninstall without removing user content", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(join(home, ".codex", "AGENTS.md"), "codex user line\n");

    const first = await captureLogs(() => runInstall(["--profile", "rules-only", "--no-default-mcps"]));
    const afterFirst = await text(join(home, ".codex", "AGENTS.md"));
    const second = await captureLogs(() => runInstall(["--profile", "rules-only", "--no-default-mcps"]));
    const afterSecond = await text(join(home, ".codex", "AGENTS.md"));

    expect(first.join("\n")).toContain("Installing component profile profile.rules-only");
    expect(second.join("\n")).toContain("Installing component profile profile.rules-only");
    expect(afterFirst).toContain("codex user line");
    expect(afterFirst).toContain(BEGIN);
    expect(afterSecond).toBe(afterFirst);

    const dryRun = await captureLogs(() => runUninstall(["--dry-run", "--keep-state"]));
    const output = dryRun.join("\n");
    expect(output).toContain("(dry-run mode");
    expect(output).toContain("Removing component profile profile.default");
    expect(output).toContain("keep MCP registry file (--keep-state)");
    expect(await text(join(home, ".codex", "AGENTS.md"))).toBe(afterFirst);
  });

  it("runs full install dry-run with project init, all MCPs, and skill flag exclusions", async () => {
    const projectDir = join(scratch, "project");
    await mkdir(projectDir, { recursive: true });

    const logs = await captureLogs(() => runInstall([
      "--dry-run",
      "--profile",
      "full",
      "--enable-all-mcps",
      "--no-skills",
      "--no-upstream-skills",
      "--with-project",
      projectDir,
    ]));
    const output = logs.join("\n");

    expect(output).toContain("Vendoring hook registration snippets");
    expect(output).toContain("Installing component profile profile.verify-all");
    expect(output).toContain("Enabling all builtin MCPs");
    expect(output).toContain(`fulcrum init ${projectDir}`);
    expect(output).toContain("Done.");
  });
});

describe("uninstall source helpers", () => {
  it("removes sentinel blocks, exact imports, and refuses ambiguous markers", async () => {
    const target = join(scratch, "rules.md");
    await writeFile(target, `before\n\n${BEGIN}\nmanaged\n${END}\n\nafter\n`);

    await removeSentinelBlock(target, "Test Agent");
    expect(await text(target)).toBe("before\n\nafter\n");

    await writeFile(target, "one\n@AGENTS.md\ntwo\n");
    await removeExactLine(target, "@AGENTS.md", "Gemini import");
    expect(await text(target)).toBe("one\ntwo\n");

    await writeFile(target, `${BEGIN}\none\n${END}\n${BEGIN}\ntwo\n${END}\n`);
    await removeSentinelBlock(target, "Test Agent");
    expect(await text(target)).toContain("two");
  });

  it("honors dry-run for sentinel and rules block removal", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".codex"), { recursive: true });
    const target = join(home, ".codex", "AGENTS.md");
    await writeFile(target, `before\n${BEGIN}\nmanaged\n${END}\nafter\n`);

    await removeRulesBlocks(home, true);

    expect(await text(target)).toContain("managed");
  });

  it("removes default policy, keeps modified policy unless purge is requested", async () => {
    const policy = join(process.env["FULCRUM_HOME"]!, "tool-output-policy.toml");

    await installToolOutputPolicy(false);
    await removeToolOutputPolicy(false, false);
    await expect(readFile(policy, "utf8")).rejects.toThrow();

    await mkdir(process.env["FULCRUM_HOME"]!, { recursive: true });
    await writeFile(policy, "custom = true\n");
    await removeToolOutputPolicy(false, false);
    expect(await text(policy)).toBe("custom = true\n");

    await removeToolOutputPolicy(true, false);
    await expect(readFile(policy, "utf8")).rejects.toThrow();
  });

  it("runs uninstall dry-run command paths for purge, caveman, and keep-state modes", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".gemini"), { recursive: true });
    await mkdir(join(home, ".pi", "agent"), { recursive: true });
    await mkdir(join(process.env["FULCRUM_HOME"]!, "hooks", "snippets"), { recursive: true });
    await mkdir(join(process.env["FULCRUM_HOME"]!, "hooks", "enabled"), { recursive: true });
    await mkdir(join(process.env["FULCRUM_HOME"]!, "state", "global"), { recursive: true });
    await writeFile(join(home, ".gemini", "GEMINI.md"), "@AGENTS.md\n");
    await writeFile(join(home, ".pi", "agent", "mcp.json"), JSON.stringify({ mcpServers: {} }));
    await writeFile(join(home, ".pi", "agent", "settings.json"), JSON.stringify({ packages: ["npm:pi-mcp-adapter"] }));
    await writeFile(join(process.env["FULCRUM_HOME"]!, "state", "global", "mcp-registry.toml"), "");

    const dryRun = await captureLogs(() => runUninstall(["--dry-run", "--purge", "--include-caveman", "--keep-state"]));

    expect(dryRun.join("\n")).toContain("(dry-run mode");
    expect(dryRun.join("\n")).toContain("Removing component profile profile.default");
    expect(dryRun.join("\n")).toContain("Removing compatibility leftovers");
    expect(dryRun.join("\n")).toContain("keep MCP registry file (--keep-state)");
    expect(dryRun.join("\n")).toContain("Optional third-party installs");
    expect(await text(join(home, ".gemini", "GEMINI.md"))).toBe("@AGENTS.md\n");
  });

  it("runs real uninstall purge cleanup across agent config files and Fulcrum state", async () => {
    const home = process.env["HOME"]!;
    const fulcrumHome = process.env["FULCRUM_HOME"]!;

    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".claude", "plugins", "cache", "fulcrum"), { recursive: true });
    await mkdir(join(home, ".claude", "plugins", "marketplaces", "fulcrum"), { recursive: true });
    await mkdir(join(home, ".gemini"), { recursive: true });
    await mkdir(join(home, ".config", "opencode"), { recursive: true });
    await mkdir(join(home, ".pi", "agent"), { recursive: true });
    await mkdir(join(home, ".codex", "plugins", "cache", "cloudflare"), { recursive: true });
    await mkdir(join(home, ".gemini", "extensions", "superpowers"), { recursive: true });
    await mkdir(join(home, ".config", "opencode", "packages", "cloudflare"), { recursive: true });
    await mkdir(join(home, ".pi", "agent", "packages", "superpowers"), { recursive: true });
    await mkdir(join(fulcrumHome, "hooks", "snippets"), { recursive: true });
    await mkdir(join(fulcrumHome, "hooks", "enabled"), { recursive: true });
    await mkdir(join(fulcrumHome, "cache", "pkg"), { recursive: true });
    await mkdir(join(fulcrumHome, "state", "global", "backups"), { recursive: true });
    await mkdir(join(fulcrumHome, "state", "product"), { recursive: true });

    await writeFile(join(home, ".gemini", "GEMINI.md"), "before\n@AGENTS.md\nafter\n");
    await writeFile(
      join(home, ".codex", "hooks.json"),
      JSON.stringify({ hooks: { PostToolUse: [] }, keep: true }, null, 2),
    );
    await writeFile(
      join(home, ".gemini", "settings.json"),
      JSON.stringify({ mcpServers: {}, hooks: { PreToolUse: [] }, keep: true }, null, 2),
    );
    await writeFile(
      join(home, ".config", "opencode", "opencode.json"),
      JSON.stringify({ mcp: {}, plugin: [], keep: true }, null, 2),
    );
    await writeFile(
      join(home, ".pi", "agent", "settings.json"),
      JSON.stringify({ packages: ["npm:pi-mcp-adapter"], keep: true }, null, 2),
    );
    await writeFile(
      join(home, ".pi", "agent", "mcp.json"),
      JSON.stringify({ mcpServers: {}, keep: true }, null, 2),
    );
    await writeFile(
      join(home, ".codex", "config.toml"),
      "# BEGIN FULCRUM MCP playwright\n[mcp_servers.playwright]\ncommand = \"npx\"\n# END FULCRUM MCP playwright\n\n[user]\nkeep = true\n",
    );
    await writeFile(
      join(home, ".claude", "settings.json"),
      JSON.stringify({
        extraKnownMarketplaces: { fulcrum: { source: "user-kept" } },
        enabledPlugins: { "fulcrum@fulcrum": { enabled: true } },
        keep: true,
      }, null, 2),
    );
    await writeFile(join(home, ".claude", "plugins", "cache", "fulcrum", "user.txt"), "keep\n");
    await writeFile(join(home, ".claude", "plugins", "marketplaces", "fulcrum", "user.txt"), "keep\n");
    await writeFile(join(home, ".codex", "plugins", "cache", "cloudflare", "owned.txt"), "owned\n");
    await writeFile(join(home, ".gemini", "extensions", "superpowers", "owned.txt"), "owned\n");
    await writeFile(join(home, ".config", "opencode", "packages", "cloudflare", "owned.txt"), "owned\n");
    await writeFile(join(home, ".pi", "agent", "packages", "superpowers", "owned.txt"), "owned\n");
    await writeFile(join(fulcrumHome, "state", "global", "mcp-registry.toml"), "");
    await writeFile(join(fulcrumHome, "state", "global", "smoke-test"), "smoke");

    const logs = await captureLogs(() => runUninstall(["--purge"]));
    const output = logs.join("\n");

    expect(output).toContain("Removing compatibility leftovers");
    expect(output).toContain("keep Claude Code plugin setting fulcrum@fulcrum (not-owned-by-fulcrum)");
    expect(await text(join(home, ".gemini", "GEMINI.md"))).toBe("before\nafter\n");
    expect(JSON.parse(await text(join(home, ".codex", "hooks.json")))).toEqual({ keep: true });
    expect(JSON.parse(await text(join(home, ".gemini", "settings.json")))).toEqual({ keep: true });
    expect(JSON.parse(await text(join(home, ".config", "opencode", "opencode.json")))).toEqual({ keep: true });
    expect(JSON.parse(await text(join(home, ".pi", "agent", "settings.json")))).toEqual({ keep: true });
    expect(JSON.parse(await text(join(home, ".pi", "agent", "mcp.json")))).toEqual({ keep: true });
    expect(JSON.parse(await text(join(home, ".claude", "settings.json")))).toEqual({
      extraKnownMarketplaces: { fulcrum: { source: "user-kept" } },
      enabledPlugins: { "fulcrum@fulcrum": { enabled: true } },
      keep: true,
    });
    expect(await text(join(home, ".claude", "plugins", "cache", "fulcrum", "user.txt"))).toBe("keep\n");
    expect(await text(join(home, ".claude", "plugins", "marketplaces", "fulcrum", "user.txt"))).toBe("keep\n");
    const codexConfig = await text(join(home, ".codex", "config.toml"));
    expect(codexConfig).not.toContain("FULCRUM MCP playwright");
    expect(codexConfig).toContain("[user]\nkeep = true");
    await expect(readFile(join(home, ".codex", "plugins", "cache", "cloudflare", "owned.txt"), "utf8")).rejects.toThrow();
    await expect(readFile(join(home, ".gemini", "extensions", "superpowers", "owned.txt"), "utf8")).rejects.toThrow();
    await expect(readFile(join(home, ".config", "opencode", "packages", "cloudflare", "owned.txt"), "utf8")).rejects.toThrow();
    await expect(readFile(join(home, ".pi", "agent", "packages", "superpowers", "owned.txt"), "utf8")).rejects.toThrow();
    await expect(readFile(join(fulcrumHome, "hooks", "snippets"), "utf8")).rejects.toThrow();
    await expect(readFile(join(fulcrumHome, "cache", "pkg"), "utf8")).rejects.toThrow();
    await expect(readFile(join(fulcrumHome, "state", "product"), "utf8")).rejects.toThrow();
  });

  it("purges only Claude plugin settings and cache paths with Fulcrum ownership markers", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".claude", "plugins", "cache", "fulcrum"), { recursive: true });
    await mkdir(join(home, ".claude", "plugins", "marketplaces", "fulcrum"), { recursive: true });
    await mkdir(join(home, ".claude", "plugins", "cache", "caveman"), { recursive: true });
    await mkdir(join(home, ".claude", "plugins", "marketplaces", "caveman"), { recursive: true });
    await mkdir(join(home, ".claude", "plugins", "cache", "cloudflare"), { recursive: true });
    await writeFile(join(home, ".claude", "plugins", "cache", "fulcrum", "owned.txt"), "owned\n");
    await writeFile(join(home, ".claude", "plugins", "marketplaces", "fulcrum", "owned.txt"), "owned\n");
    await writeFile(join(home, ".claude", "plugins", "cache", "caveman", "owned.txt"), "owned\n");
    await writeFile(join(home, ".claude", "plugins", "marketplaces", "caveman", "owned.txt"), "owned\n");
    await writeFile(join(home, ".claude", "plugins", "cache", "cloudflare", "user.txt"), "keep\n");
    await writeFile(
      join(home, ".claude", "settings.json"),
      JSON.stringify({
        extraKnownMarketplaces: {
          fulcrum: { source: "owned" },
          caveman: { source: "owned" },
          cloudflare: { source: "user" },
        },
        enabledPlugins: {
          "fulcrum@fulcrum": { enabled: true },
          "caveman@caveman": { enabled: true },
          "cloudflare@cloudflare": { enabled: true },
        },
        keep: true,
      }, null, 2),
    );
    await writeMarker({ plugin: "fulcrum@fulcrum", marketplace: "moabualruz/fulcrum", operation: "install" });
    await writeMarker({ plugin: "caveman@caveman", marketplace: "JuliusBrussee/caveman", operation: "install" });

    const logs = await captureLogs(() => runUninstall(["--purge"]));
    const settings = JSON.parse(await text(join(home, ".claude", "settings.json")));

    expect(logs.join("\n")).toContain("Claude Code managed plugin settings cleaned");
    expect(settings).toEqual({
      extraKnownMarketplaces: { cloudflare: { source: "user" } },
      enabledPlugins: { "cloudflare@cloudflare": { enabled: true } },
      keep: true,
    });
    await expect(readFile(join(home, ".claude", "plugins", "cache", "fulcrum", "owned.txt"), "utf8")).rejects.toThrow();
    await expect(readFile(join(home, ".claude", "plugins", "marketplaces", "caveman", "owned.txt"), "utf8")).rejects.toThrow();
    expect(await text(join(home, ".claude", "plugins", "cache", "cloudflare", "user.txt"))).toBe("keep\n");
  });

  it("keeps malformed agent JSON during uninstall and reports why cleanup is skipped", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".pi", "agent"), { recursive: true });
    await writeFile(join(home, ".pi", "agent", "mcp.json"), "{not json");
    await writeFile(join(home, ".pi", "agent", "settings.json"), "{not json");

    const logs = await captureLogs(() => runUninstall([]));
    const output = logs.join("\n");

    expect(output).toContain("Pi MCP config not JSON; keep pi-mcp-adapter");
    expect(await text(join(home, ".pi", "agent", "mcp.json"))).toBe("{not json");
    expect(await text(join(home, ".pi", "agent", "settings.json"))).toBe("{not json");
  });

  it("previews Caveman mirror cleanup using package-owned hook sources and leaves files untouched", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".codex", "plugins", "cache", "caveman", "caveman", "0.1.0", "package", ".codex"), { recursive: true });
    await mkdir(join(home, ".codex", "skills", "caveman"), { recursive: true });
    await mkdir(join(home, ".config", "opencode", "skills", "caveman"), { recursive: true });
    await mkdir(join(home, ".pi", "agent", "skills", "caveman"), { recursive: true });
    await mkdir(join(home, ".gemini", "extensions", "caveman"), { recursive: true });
    await mkdir(join(home, ".config", "caveman"), { recursive: true });
    await mkdir(join(process.env["FULCRUM_HOME"]!, "state", "global"), { recursive: true });
    await writeFile(join(process.env["FULCRUM_HOME"]!, "state", "global", "caveman-mirrors.installed"), "owned\n");
    await writeFile(join(home, ".config", "caveman", "config.json"), JSON.stringify({ defaultMode: "ultra" }));
    await writeFile(
      join(home, ".codex", "plugins", "cache", "caveman", "caveman", "0.1.0", "package", ".codex", "hooks.json"),
      JSON.stringify({ hooks: { PostToolUse: [{ command: "caveman compress" }] } }, null, 2),
    );
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(
      join(home, ".codex", "hooks.json"),
      JSON.stringify({ hooks: { PostToolUse: [{ command: "caveman compress" }, { command: "keep me" }] } }, null, 2),
    );
    await writeFile(
      join(home, ".codex", "config.toml"),
      "[marketplaces.caveman]\nrepo = \"JuliusBrussee/caveman\"\n\n[plugins.\"caveman@caveman\"]\nenabled = true\n\n[user]\nkeep = true\n",
    );

    const logs = await captureLogs(() => removeCavemanCopies(home, { dryRun: true }));
    const output = logs.join("\n");

    expect(output).toContain("would remove Codex Caveman plugin config");
    expect(output).toContain("would remove");
    expect(await text(join(home, ".codex", "config.toml"))).toContain("[plugins.\"caveman@caveman\"]");
    expect(await text(join(home, ".codex", "hooks.json"))).toContain("caveman compress");
    expect(await text(join(home, ".config", "caveman", "config.json"))).toContain("ultra");
  });

  it("removes Caveman mirrors, matching hook entries, plugin config, and empty containers when owned", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".codex", "plugins", "cache", "caveman", "caveman", "0.1.0", "package", ".codex"), { recursive: true });
    await mkdir(join(home, ".codex", "skills", "caveman"), { recursive: true });
    await mkdir(join(home, ".codex", "skills", "compress"), { recursive: true });
    await mkdir(join(home, ".config", "opencode", "skills", "caveman"), { recursive: true });
    await mkdir(join(home, ".config", "opencode", "packages", "caveman"), { recursive: true });
    await mkdir(join(home, ".pi", "agent", "skills", "caveman"), { recursive: true });
    await mkdir(join(home, ".pi", "agent", "packages", "caveman"), { recursive: true });
    await mkdir(join(home, ".gemini", "extensions", "caveman"), { recursive: true });
    await mkdir(join(home, ".config", "caveman"), { recursive: true });
    await mkdir(join(process.env["FULCRUM_HOME"]!, "state", "global"), { recursive: true });
    await writeFile(join(process.env["FULCRUM_HOME"]!, "state", "global", "caveman-mirrors.installed"), "owned\n");
    await writeFile(join(home, ".config", "caveman", "config.json"), JSON.stringify({ defaultMode: "ultra" }));
    await writeFile(join(home, ".codex", "skills", "caveman", "SKILL.md"), "owned\n");
    await writeFile(join(home, ".codex", "skills", "compress", "SKILL.md"), "owned\n");
    await writeFile(
      join(home, ".codex", "plugins", "cache", "caveman", "caveman", "0.1.0", "package", ".codex", "hooks.json"),
      JSON.stringify({ hooks: { PostToolUse: [{ command: "caveman compress" }] } }, null, 2),
    );
    await writeFile(
      join(home, ".codex", "hooks.json"),
      JSON.stringify({ hooks: { PostToolUse: [{ command: "caveman compress" }, { command: "keep me" }] } }, null, 2),
    );
    await writeFile(
      join(home, ".codex", "config.toml"),
      "[marketplaces.caveman]\nsource = \"https://github.com/JuliusBrussee/caveman\"\n\n[plugins.\"caveman@caveman\"]\nenabled = true\n\n[user]\nkeep = true\n",
    );

    await removeCavemanCopies(home);

    expect(await text(join(home, ".codex", "hooks.json"))).toContain("keep me");
    expect(await text(join(home, ".codex", "hooks.json"))).not.toContain("caveman compress");
    expect(await text(join(home, ".codex", "config.toml"))).toContain("[user]");
    expect(await text(join(home, ".codex", "config.toml"))).not.toContain("caveman@caveman");
    await expect(readFile(join(home, ".codex", "skills", "caveman", "SKILL.md"), "utf8")).rejects.toThrow();
    await expect(readFile(join(home, ".codex", "skills", "compress", "SKILL.md"), "utf8")).rejects.toThrow();
    await expect(readFile(join(home, ".config", "opencode", "packages", "caveman", ".fulcrum-unsupported.json"), "utf8")).rejects.toThrow();
    await expect(readFile(join(home, ".pi", "agent", "packages", "caveman", ".fulcrum-unsupported.json"), "utf8")).rejects.toThrow();
    await expect(readFile(join(home, ".gemini", "extensions", "caveman", "extension.toml"), "utf8")).rejects.toThrow();
    await expect(readFile(join(home, ".config", "caveman", "config.json"), "utf8")).rejects.toThrow();
    await expect(readFile(join(process.env["FULCRUM_HOME"]!, "state", "global", "caveman-mirrors.installed"), "utf8")).rejects.toThrow();
  });

  it("rejects unknown uninstall flags with exit code 2", async () => {
    const originalExit = process.exit;
    process.exit = ((code?: string | number | null | undefined) => {
      throw new Error(`process.exit(${code ?? 0})`);
    }) as typeof process.exit;
    try {
      await expect(runUninstall(["--bogus"])).rejects.toThrow("process.exit(2)");
    } finally {
      process.exit = originalExit;
    }
  });
});
