// Tests for fulcrum doctor --json Pi MCP adapter fields.

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let TMP: string;

beforeAll(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-doctor-test-"));
});

afterAll(async () => {
  await rm(TMP, { recursive: true, force: true });
});

async function runDoctor(home: string, extraEnv: Record<string, string | undefined> = {}): Promise<Record<string, unknown>> {
  const baseEnv: Record<string, string | undefined> = { ...process.env, HOME: home };
  // Default-isolate the two caveman env knobs so tests are not influenced by
  // the developer's actual environment. Callers can override either.
  delete baseEnv["XDG_CONFIG_HOME"];
  delete baseEnv["CAVEMAN_DEFAULT_MODE"];
  for (const [k, v] of Object.entries(extraEnv)) {
    if (v === undefined) delete baseEnv[k];
    else baseEnv[k] = v;
  }
  const proc = Bun.spawn(["bun", "src/index.ts", "doctor", "--json"], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
    env: baseEnv as Record<string, string>,
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return JSON.parse(out) as Record<string, unknown>;
}

async function runDoctorHuman(home: string, extraEnv: Record<string, string | undefined> = {}): Promise<string> {
  const baseEnv: Record<string, string | undefined> = { ...process.env, HOME: home };
  delete baseEnv["XDG_CONFIG_HOME"];
  delete baseEnv["CAVEMAN_DEFAULT_MODE"];
  for (const [k, v] of Object.entries(extraEnv)) {
    if (v === undefined) delete baseEnv[k];
    else baseEnv[k] = v;
  }
  const proc = Bun.spawn(["bun", "src/index.ts", "doctor"], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
    env: baseEnv as Record<string, string>,
  });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out;
}

describe("doctor --json piMcpAdapter field", () => {
  test("both false when ~/.pi/agent does not exist", async () => {
    const home = join(TMP, "no-pi");
    await mkdir(home, { recursive: true });
    const report = await runDoctor(home);
    const adapter = report["piMcpAdapter"] as Record<string, unknown>;
    expect(adapter).toBeDefined();
    expect(adapter["adapterPresent"]).toBe(false);
    expect(adapter["deepwikiPresent"]).toBe(false);
  });

  test("adapterPresent true when pi-mcp-adapter in packages", async () => {
    const home = join(TMP, "pi-adapter-present");
    await mkdir(`${home}/.pi/agent`, { recursive: true });
    await writeFile(
      `${home}/.pi/agent/settings.json`,
      JSON.stringify({ packages: ["npm:pi-mcp-adapter"] }),
    );
    const report = await runDoctor(home);
    const adapter = report["piMcpAdapter"] as Record<string, unknown>;
    expect(adapter["adapterPresent"]).toBe(true);
    expect(adapter["deepwikiPresent"]).toBe(false);
  });

  test("deepwikiPresent true when deepwiki in mcp.json", async () => {
    const home = join(TMP, "pi-deepwiki-present");
    await mkdir(`${home}/.pi/agent`, { recursive: true });
    await writeFile(
      `${home}/.pi/agent/settings.json`,
      JSON.stringify({ packages: ["npm:pi-mcp-adapter"] }),
    );
    await writeFile(
      `${home}/.pi/agent/mcp.json`,
      JSON.stringify({ mcpServers: { deepwiki: { url: "https://mcp.deepwiki.com/mcp" } } }),
    );
    const report = await runDoctor(home);
    const adapter = report["piMcpAdapter"] as Record<string, unknown>;
    expect(adapter["adapterPresent"]).toBe(true);
    expect(adapter["deepwikiPresent"]).toBe(true);
  });

  test("both false when settings.json and mcp.json are empty objects", async () => {
    const home = join(TMP, "pi-empty-configs");
    await mkdir(`${home}/.pi/agent`, { recursive: true });
    await writeFile(`${home}/.pi/agent/settings.json`, JSON.stringify({}));
    await writeFile(`${home}/.pi/agent/mcp.json`, JSON.stringify({}));
    const report = await runDoctor(home);
    const adapter = report["piMcpAdapter"] as Record<string, unknown>;
    expect(adapter["adapterPresent"]).toBe(false);
    expect(adapter["deepwikiPresent"]).toBe(false);
  });

  test("report includes verdict field", async () => {
    const home = join(TMP, "pi-verdict");
    await mkdir(home, { recursive: true });
    const report = await runDoctor(home);
    expect(["ok", "warning", "error"]).toContain(report["verdict"] as string);
  });
});

describe("doctor --json component lifecycle section", () => {
  test("reports component lifecycle state", async () => {
    const home = join(TMP, "component-lifecycle");
    await mkdir(home, { recursive: true });
    const fulcrumHome = join(home, ".fulcrum");
    const { ComponentLedger } = await import("../components/ledger.ts");
    const ledger = ComponentLedger.open(join(fulcrumHome, "state", "global", "components.db"));
    ledger.recordComponent({ id: "hooks.format", kind: "hook", status: "installed" });
    ledger.close();

    const report = await runDoctor(home, { FULCRUM_HOME: fulcrumHome });
    const components = report["components"] as Record<string, unknown> | undefined;
    expect(components?.["total"]).toBeGreaterThan(0);
    expect(components?.["installed"]).toBeGreaterThan(0);
    expect(components?.["database"]).toBe(join(fulcrumHome, "state", "global", "components.db"));
  });
});

describe("doctor project-local worktree warnings", () => {
  test("reports ignored .claude/worktrees roots in JSON and human output", async () => {
    const home = join(TMP, "worktree-home");
    const repo = join(TMP, "repo-with-local-worktrees");
    await mkdir(join(home), { recursive: true });
    await mkdir(join(repo, ".claude", "worktrees", "component-ledger"), { recursive: true });

    const report = await runDoctor(home, { FULCRUM_REPO_DIR: repo });
    const worktrees = report["worktrees"] as Record<string, unknown>;
    const roots = worktrees["projectLocalIgnoredRoots"] as Array<Record<string, unknown>>;
    expect(roots).toHaveLength(1);
    expect(roots[0]!["path"]).toBe(join(repo, ".claude", "worktrees"));
    expect(roots[0]!["entries"]).toEqual(["component-ledger"]);
    expect(report["warnings"]).toBeGreaterThan(0);

    const human = await runDoctorHuman(home, { FULCRUM_REPO_DIR: repo });
    expect(human).toContain(".claude/worktrees");
    expect(human).toContain("component-ledger");
  });
});

describe("doctor skill budget section", () => {
  test("reports Codex active skill metadata pressure with source roots and top descriptions", async () => {
    const home = join(TMP, "skill-budget-codex");
    await mkdir(join(home, ".codex", "skills", "alpha"), { recursive: true });
    await mkdir(join(home, ".codex", "plugins", "cache", "vendor", "pkg", "0.1.0", "skills", "beta"), { recursive: true });
    await writeFile(
      join(home, ".codex", "skills", "alpha", "SKILL.md"),
      "---\nname: alpha\ndescription: Alpha skill description\n---\n",
    );
    await writeFile(
      join(home, ".codex", "plugins", "cache", "vendor", "pkg", "0.1.0", "skills", "beta", "SKILL.md"),
      "---\nname: beta\ndescription: Beta skill description is longer\n---\n",
    );

    const report = await runDoctor(home);
    const skillBudget = report["skillBudget"] as Record<string, unknown>;
    const agents = skillBudget["agents"] as Array<Record<string, unknown>>;
    const codex = agents.find((agent) => agent["id"] === "codex")!;
    expect(codex["activeSkillCount"]).toBe(2);
    expect(codex["totalDescriptionChars"]).toBe(
      "Alpha skill description".length + "Beta skill description is longer".length,
    );
    const roots = codex["sourceRoots"] as Array<Record<string, unknown>>;
    expect(roots.map((root) => root["path"])).toContain(join(home, ".codex", "skills"));
    expect(roots.map((root) => root["path"])).toContain(join(home, ".codex", "plugins", "cache"));
    const top = codex["topDescriptions"] as Array<Record<string, unknown>>;
    expect(top[0]!["name"]).toBe("beta");
  });
});

describe("doctor --json caveman section", () => {
  test("defaultMode='' source=default when no config + no env", async () => {
    const home = join(TMP, "caveman-default");
    await mkdir(home, { recursive: true });
    const report = await runDoctor(home);
    const cm = report["caveman"] as Record<string, unknown>;
    expect(cm["defaultMode"]).toBe("");
    expect(cm["defaultModeSource"]).toBe("default");
    expect(cm["configPath"]).toBe("");
  });

  test("reads defaultMode from ~/.config/caveman/config.json (source=file)", async () => {
    const home = join(TMP, "caveman-file");
    const cfgDir = `${home}/.config/caveman`;
    await mkdir(cfgDir, { recursive: true });
    await writeFile(`${cfgDir}/config.json`, JSON.stringify({ defaultMode: "ultra" }));
    const report = await runDoctor(home);
    const cm = report["caveman"] as Record<string, unknown>;
    expect(cm["defaultMode"]).toBe("ultra");
    expect(cm["defaultModeSource"]).toBe("file");
    expect(cm["configPath"]).toBe(`${cfgDir}/config.json`);
  });

  test("env CAVEMAN_DEFAULT_MODE overrides config (source=env)", async () => {
    const home = join(TMP, "caveman-env");
    const cfgDir = `${home}/.config/caveman`;
    await mkdir(cfgDir, { recursive: true });
    await writeFile(`${cfgDir}/config.json`, JSON.stringify({ defaultMode: "ultra" }));
    const report = await runDoctor(home, { CAVEMAN_DEFAULT_MODE: "lite" });
    const cm = report["caveman"] as Record<string, unknown>;
    expect(cm["defaultMode"]).toBe("lite");
    expect(cm["defaultModeSource"]).toBe("env");
  });

  test("malformed config JSON reported with source=malformed", async () => {
    const home = join(TMP, "caveman-malformed");
    const cfgDir = `${home}/.config/caveman`;
    await mkdir(cfgDir, { recursive: true });
    await writeFile(`${cfgDir}/config.json`, "{ not json");
    const report = await runDoctor(home);
    const cm = report["caveman"] as Record<string, unknown>;
    expect(cm["defaultModeSource"]).toBe("malformed");
  });

  test("XDG_CONFIG_HOME wins over $HOME/.config when set", async () => {
    const home = join(TMP, "caveman-xdg-home");
    const xdg = join(TMP, "caveman-xdg");
    await mkdir(`${xdg}/caveman`, { recursive: true });
    await mkdir(home, { recursive: true });
    await writeFile(`${xdg}/caveman/config.json`, JSON.stringify({ defaultMode: "wenyan-full" }));
    const report = await runDoctor(home, { XDG_CONFIG_HOME: xdg });
    const cm = report["caveman"] as Record<string, unknown>;
    expect(cm["defaultMode"]).toBe("wenyan-full");
    expect(cm["configPath"]).toBe(`${xdg}/caveman/config.json`);
  });

  test("per-agent installed flag reflects cavemanInstallDir presence", async () => {
    const home = join(TMP, "caveman-per-agent");
    await mkdir(`${home}/.codex/skills/caveman`, { recursive: true });
    await mkdir(`${home}/.gemini/extensions/caveman`, { recursive: true });
    const report = await runDoctor(home);
    const cm = report["caveman"] as Record<string, unknown>;
    const agents = cm["agents"] as Array<Record<string, unknown>>;
    const byLabel = new Map(agents.map((a) => [a["label"], a["installed"]]));
    expect(byLabel.get("Codex CLI")).toBe(true);
    expect(byLabel.get("Gemini CLI")).toBe(true);
    expect(byLabel.get("Claude Code")).toBe(false);
    expect(byLabel.get("OpenCode")).toBe(false);
    expect(byLabel.get("Pi CLI")).toBe(false);
  });
});

describe("doctor --json mcp section", () => {
  test("mcp section present and empty when no registry", async () => {
    const home = join(TMP, "mcp-no-registry");
    await mkdir(home, { recursive: true });
    const report = await runDoctor(home);
    const mcp = report["mcp"] as Record<string, unknown>;
    expect(mcp).toBeDefined();
    expect(Array.isArray(mcp["servers"])).toBe(true);
    expect((mcp["servers"] as unknown[]).length).toBe(0);
  });

  test("mcp section lists registered servers", async () => {
    const home = join(TMP, "mcp-with-registry");
    await mkdir(home, { recursive: true });
    // Pre-write a minimal mcp-registry.toml.
    const fulcrumHome = join(home, ".fulcrum");
    const stateDir = join(fulcrumHome, "state", "global");
    await mkdir(stateDir, { recursive: true });
    const toml = `schema_version = 1

[servers.github]
transport = "http"
url = "https://api.githubcopilot.com/mcp/"
description = "GitHub MCP"
vendor = "github"
default_enabled = false
auth_env_vars = ["GITHUB_TOKEN"]

[servers.github.agent_visibility]
"claude-code" = true
"codex" = true
"gemini" = true
"opencode" = true
"pi" = true
`;
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(join(stateDir, "mcp-registry.toml"), toml)
    );
    const report = await runDoctor(home, { FULCRUM_HOME: fulcrumHome });
    const mcp = report["mcp"] as Record<string, unknown>;
    const servers = mcp["servers"] as Array<Record<string, unknown>>;
    expect(servers.length).toBeGreaterThan(0);
    const github = servers.find((s) => s["name"] === "github");
    expect(github).toBeDefined();
    expect(github!["transport"]).toBe("http");
    expect(github!["vendor"]).toBe("github");
    expect(github!["default_enabled"]).toBe(false);
    expect(github!["agent_state"]).toBeDefined();
  });

  test("drift flagged when default_enabled=false and any agent enabled", async () => {
    const home = join(TMP, "mcp-drift");
    await mkdir(home, { recursive: true });
    const fulcrumHome = join(home, ".fulcrum");
    const stateDir = join(fulcrumHome, "state", "global");
    await mkdir(stateDir, { recursive: true });
    const toml = `schema_version = 1

[servers.github]
transport = "http"
url = "https://api.githubcopilot.com/mcp/"
description = "GitHub MCP"
vendor = "github"
default_enabled = false
auth_env_vars = ["GITHUB_TOKEN"]
enabled_codex = true

[servers.github.agent_visibility]
"claude-code" = true
"codex" = true
"gemini" = true
"opencode" = true
"pi" = true
`;
    await writeFile(join(stateDir, "mcp-registry.toml"), toml);
    const report = await runDoctor(home, { FULCRUM_HOME: fulcrumHome });
    const mcp = report["mcp"] as Record<string, unknown>;
    const servers = mcp["servers"] as Array<Record<string, unknown>>;
    const github = servers.find((s) => s["name"] === "github");
    expect(github!["drift"]).toBe(true);
  });

  test("drift false when default-disabled and no agent enabled", async () => {
    const home = join(TMP, "mcp-no-drift");
    await mkdir(home, { recursive: true });
    const fulcrumHome = join(home, ".fulcrum");
    const stateDir = join(fulcrumHome, "state", "global");
    await mkdir(stateDir, { recursive: true });
    const toml = `schema_version = 1

[servers.github]
transport = "http"
url = "https://api.githubcopilot.com/mcp/"
description = "GitHub MCP"
vendor = "github"
default_enabled = false
auth_env_vars = ["GITHUB_TOKEN"]

[servers.github.agent_visibility]
"claude-code" = true
"codex" = true
"gemini" = true
"opencode" = true
"pi" = true
`;
    await writeFile(join(stateDir, "mcp-registry.toml"), toml);
    const report = await runDoctor(home, { FULCRUM_HOME: fulcrumHome });
    const servers = (report["mcp"] as Record<string, unknown>)["servers"] as Array<Record<string, unknown>>;
    const github = servers.find((s) => s["name"] === "github");
    expect(github!["drift"]).toBe(false);
  });

  test("wiring missing when codex config lacks bearer_token_env_var for authed http MCP", async () => {
    const home = join(TMP, "mcp-wiring-missing");
    await mkdir(home, { recursive: true });
    const fulcrumHome = join(home, ".fulcrum");
    const stateDir = join(fulcrumHome, "state", "global");
    await mkdir(stateDir, { recursive: true });
    const codexDir = join(home, ".codex");
    await mkdir(codexDir, { recursive: true });
    // Codex block without bearer_token_env_var (the regression of the day).
    await writeFile(join(codexDir, "config.toml"),
`# BEGIN FULCRUM MCP github
[mcp_servers.github]
url = "https://api.githubcopilot.com/mcp/"
# END FULCRUM MCP github
`);
    const toml = `schema_version = 1

[servers.github]
transport = "http"
url = "https://api.githubcopilot.com/mcp/"
description = "GitHub MCP"
vendor = "github"
default_enabled = false
auth_env_vars = ["GITHUB_TOKEN"]
enabled_codex = true

[servers.github.agent_visibility]
"claude-code" = true
"codex" = true
"gemini" = true
"opencode" = true
"pi" = true
`;
    await writeFile(join(stateDir, "mcp-registry.toml"), toml);
    const report = await runDoctor(home, { FULCRUM_HOME: fulcrumHome });
    const servers = (report["mcp"] as Record<string, unknown>)["servers"] as Array<Record<string, unknown>>;
    const github = servers.find((s) => s["name"] === "github");
    const wiring = github!["wiring"] as Record<string, string>;
    expect(wiring["codex"]).toBe("missing");
  });

  test("wiring ok when codex config includes bearer_token_env_var", async () => {
    const home = join(TMP, "mcp-wiring-ok");
    await mkdir(home, { recursive: true });
    const fulcrumHome = join(home, ".fulcrum");
    const stateDir = join(fulcrumHome, "state", "global");
    await mkdir(stateDir, { recursive: true });
    const codexDir = join(home, ".codex");
    await mkdir(codexDir, { recursive: true });
    await writeFile(join(codexDir, "config.toml"),
`# BEGIN FULCRUM MCP github
[mcp_servers.github]
url = "https://api.githubcopilot.com/mcp/"
bearer_token_env_var = "GITHUB_TOKEN"
# END FULCRUM MCP github
`);
    const toml = `schema_version = 1

[servers.github]
transport = "http"
url = "https://api.githubcopilot.com/mcp/"
description = "GitHub MCP"
vendor = "github"
default_enabled = false
auth_env_vars = ["GITHUB_TOKEN"]
enabled_codex = true

[servers.github.agent_visibility]
"claude-code" = true
"codex" = true
"gemini" = true
"opencode" = true
"pi" = true
`;
    await writeFile(join(stateDir, "mcp-registry.toml"), toml);
    const report = await runDoctor(home, { FULCRUM_HOME: fulcrumHome });
    const servers = (report["mcp"] as Record<string, unknown>)["servers"] as Array<Record<string, unknown>>;
    const github = servers.find((s) => s["name"] === "github");
    const wiring = github!["wiring"] as Record<string, string>;
    expect(wiring["codex"]).toBe("ok");
  });

  test("auth_status missing-env when GITHUB_TOKEN not set", async () => {
    const home = join(TMP, "mcp-missing-env");
    await mkdir(home, { recursive: true });
    const fulcrumHome = join(home, ".fulcrum");
    const stateDir = join(fulcrumHome, "state", "global");
    await mkdir(stateDir, { recursive: true });
    const toml = `schema_version = 1

[servers.github]
transport = "http"
url = "https://api.githubcopilot.com/mcp/"
description = "GitHub MCP"
vendor = "github"
default_enabled = false
auth_env_vars = ["GITHUB_TOKEN"]
enabled_codex = true

[servers.github.agent_visibility]
"claude-code" = true
"codex" = true
"gemini" = true
"opencode" = true
"pi" = true
`;
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(join(stateDir, "mcp-registry.toml"), toml)
    );
    // Explicitly unset GITHUB_TOKEN.
    const report = await runDoctor(home, { FULCRUM_HOME: fulcrumHome, GITHUB_TOKEN: undefined });
    const mcp = report["mcp"] as Record<string, unknown>;
    const servers = mcp["servers"] as Array<Record<string, unknown>>;
    const github = servers.find((s) => s["name"] === "github");
    expect(github!["auth_status"]).toBe("missing-env");
  });

  test("auth_status n/a for disabled MCP even when auth env var is absent", async () => {
    const home = join(TMP, "mcp-disabled-auth");
    await mkdir(home, { recursive: true });
    const fulcrumHome = join(home, ".fulcrum");
    const stateDir = join(fulcrumHome, "state", "global");
    await mkdir(stateDir, { recursive: true });
    const toml = `schema_version = 1

[servers.github]
transport = "http"
url = "https://api.githubcopilot.com/mcp/"
description = "GitHub MCP"
vendor = "github"
default_enabled = false
auth_env_vars = ["GITHUB_TOKEN"]

[servers.github.agent_visibility]
"claude-code" = true
"codex" = true
"gemini" = true
"opencode" = true
"pi" = true
`;
    await writeFile(join(stateDir, "mcp-registry.toml"), toml);
    const report = await runDoctor(home, { FULCRUM_HOME: fulcrumHome, GITHUB_TOKEN: undefined });
    const servers = (report["mcp"] as Record<string, unknown>)["servers"] as Array<Record<string, unknown>>;
    const github = servers.find((s) => s["name"] === "github");
    expect(github!["auth_status"]).toBe("n/a");
  });

  test("auth_status n/a for context7 without optional API key", async () => {
    const home = join(TMP, "mcp-context7-optional-auth");
    await mkdir(home, { recursive: true });
    const fulcrumHome = join(home, ".fulcrum");
    const stateDir = join(fulcrumHome, "state", "global");
    await mkdir(stateDir, { recursive: true });
    const toml = `schema_version = 1

[servers.context7]
transport = "http"
url = "https://mcp.context7.com/mcp"
description = "Context7 MCP"
vendor = "upstash"
default_enabled = false
auth_env_vars = ["CONTEXT7_API_KEY"]
enabled_codex = true

[servers.context7.agent_visibility]
"claude-code" = true
"codex" = true
"gemini" = true
"opencode" = true
"pi" = true
`;
    await writeFile(join(stateDir, "mcp-registry.toml"), toml);
    const report = await runDoctor(home, { FULCRUM_HOME: fulcrumHome, CONTEXT7_API_KEY: undefined });
    const servers = (report["mcp"] as Record<string, unknown>)["servers"] as Array<Record<string, unknown>>;
    const context7 = servers.find((s) => s["name"] === "context7");
    expect(context7!["auth_status"]).toBe("n/a");
  });
});
