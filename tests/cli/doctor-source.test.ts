import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "../../apps/cli/src/doctor.ts";
import { registerServer, setEnabled } from "../../apps/cli/src/mcp-registry.ts";

let scratch: string;
let previousHome: string | undefined;
let previousFulcrumHome: string | undefined;
let previousPath: string | undefined;
let previousXdgConfigHome: string | undefined;
let previousFulcrumPolicy: string | undefined;
let previousFulcrumRepoDir: string | undefined;
let previousCavemanDefaultMode: string | undefined;

async function captureRun(args: string[]): Promise<string> {
  let stdout = "";
  const originalLog = console.log;
  const originalExit = process.exit;
  console.log = (...parts: unknown[]) => {
    stdout += `${parts.map(String).join(" ")}\n`;
  };
  process.exit = ((code?: string | number | null | undefined) => {
    throw new Error(`process.exit(${code ?? 0})`);
  }) as typeof process.exit;
  try {
    try {
      await run(args);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("process.exit(")) throw error;
    }
    return stdout;
  } finally {
    console.log = originalLog;
    process.exit = originalExit;
  }
}

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-doctor-source-"));
  previousHome = process.env["HOME"];
  previousFulcrumHome = process.env["FULCRUM_HOME"];
  previousPath = process.env["PATH"];
  previousXdgConfigHome = process.env["XDG_CONFIG_HOME"];
  previousFulcrumPolicy = process.env["FULCRUM_POLICY"];
  previousFulcrumRepoDir = process.env["FULCRUM_REPO_DIR"];
  previousCavemanDefaultMode = process.env["CAVEMAN_DEFAULT_MODE"];
  process.env["HOME"] = join(scratch, "home");
  process.env["FULCRUM_HOME"] = join(scratch, "fulcrum-home");
  process.env["PATH"] = join(scratch, "bin");
  process.env["XDG_CONFIG_HOME"] = join(scratch, "xdg");
  process.env["FULCRUM_REPO_DIR"] = join(scratch, "repo");
  await mkdir(process.env["HOME"]!, { recursive: true });
  await mkdir(process.env["PATH"]!, { recursive: true });
  await mkdir(join(process.env["FULCRUM_REPO_DIR"]!, "skills"), { recursive: true });
});

afterEach(async () => {
  if (previousHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = previousHome;
  if (previousFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = previousFulcrumHome;
  if (previousPath === undefined) delete process.env["PATH"];
  else process.env["PATH"] = previousPath;
  if (previousXdgConfigHome === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = previousXdgConfigHome;
  if (previousFulcrumPolicy === undefined) delete process.env["FULCRUM_POLICY"];
  else process.env["FULCRUM_POLICY"] = previousFulcrumPolicy;
  if (previousFulcrumRepoDir === undefined) delete process.env["FULCRUM_REPO_DIR"];
  else process.env["FULCRUM_REPO_DIR"] = previousFulcrumRepoDir;
  if (previousCavemanDefaultMode === undefined) delete process.env["CAVEMAN_DEFAULT_MODE"];
  else process.env["CAVEMAN_DEFAULT_MODE"] = previousCavemanDefaultMode;
  await rm(scratch, { recursive: true, force: true });
});

describe("doctor CLI source command", () => {
  test("emits API subsystem JSON smoke output", async () => {
    const output = await captureRun(["--subsystem", "api", "--json"]);
    const report = JSON.parse(output) as { subsystem: string; checks: unknown[]; summary: { pass: number; warn: number; fail: number } };

    expect(report.subsystem).toBe("api");
    expect(report.checks.length).toBeGreaterThan(0);
    expect(report.summary.pass + report.summary.warn + report.summary.fail).toBeGreaterThan(0);
  });

  test("emits full JSON report with agents, caveman, tools, MCP, components, and orchestration", async () => {
    const home = process.env["HOME"]!;
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".gemini"), { recursive: true });
    await mkdir(join(home, ".pi", "agent"), { recursive: true });
    await mkdir(join(process.env["XDG_CONFIG_HOME"]!, "caveman"), { recursive: true });
    await writeFile(join(home, ".codex", "AGENTS.md"), "<!-- BEGIN FULCRUM RULES -->\nmanaged\n<!-- END FULCRUM RULES -->\n");
    await writeFile(join(home, "AGENTS.md"), "<!-- BEGIN FULCRUM RULES -->\nmanaged\n<!-- END FULCRUM RULES -->\n");
    await writeFile(join(home, ".gemini", "GEMINI.md"), "@AGENTS.md\n");
    await writeFile(join(process.env["XDG_CONFIG_HOME"]!, "caveman", "config.json"), JSON.stringify({ defaultMode: "ultra" }));
    await writeFile(join(home, ".pi", "agent", "settings.json"), JSON.stringify({ packages: ["npm:pi-mcp-adapter"] }));
    await writeFile(join(home, ".pi", "agent", "mcp.json"), JSON.stringify({ mcpServers: { deepwiki: {} } }));
    await mkdir(join(home, ".claude", "plugins", "cache", "caveman", "caveman"), { recursive: true });

    const output = await captureRun(["--json"]);
    const report = JSON.parse(output) as Record<string, any>;

    expect(report.bun).toBeString();
    expect(report.agents.some((agent: { label: string; detected: boolean }) => agent.label === "Codex CLI" && agent.detected)).toBe(true);
    expect(report.caveman.defaultMode).toBe("ultra");
    expect(report.piMcpAdapter).toEqual({ adapterPresent: true, deepwikiPresent: true });
    expect(report.tools.length).toBeGreaterThan(20);
    expect(report.components.total).toBeGreaterThan(0);
    expect(Array.isArray(report.components.packageParity)).toBe(true);
    expect(Array.isArray(report.mcp.servers)).toBe(true);
    expect(report.orchestration.checks.length).toBeGreaterThan(0);
    expect(["ok", "warning", "error"]).toContain(report.verdict);
  });

  test("emits human report and exits nonzero when hard failures are present", async () => {
    const output = await captureRun([]);

    expect(output).toContain("fulcrum doctor");
    expect(output).toContain("Agents detected:");
    expect(output).toContain("Tools (hooks fail-open");
    expect(output).toContain("Components:");
    expect(output).toMatch(/warning|error|all checks passed/);
  });

  test("reports env-overridden caveman mode, policy file metadata, tool paths, and project-local worktrees", async () => {
    const home = process.env["HOME"]!;
    const repo = process.env["FULCRUM_REPO_DIR"]!;
    const policyPath = join(scratch, "policy.toml");
    process.env["FULCRUM_POLICY"] = policyPath;
    process.env["CAVEMAN_DEFAULT_MODE"] = "normal";
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".claude", "plugins", "cache", "caveman", "caveman"), { recursive: true });
    await mkdir(join(process.env["XDG_CONFIG_HOME"]!, "caveman"), { recursive: true });
    await writeFile(join(process.env["XDG_CONFIG_HOME"]!, "caveman", "config.json"), "{not-json");
    await writeFile(join(home, ".codex", "hooks.json"), JSON.stringify({ hooks: [{ message: "CAVEMAN MODE ACTIVE" }] }));
    await writeFile(policyPath, "[commands]\n");
    await writeFile(join(process.env["PATH"]!, "rg"), "#!/bin/sh\nexit 0\n");
    await chmod(join(process.env["PATH"]!, "rg"), 0o755);
    await mkdir(join(repo, "skills", "live-skill"), { recursive: true });
    await mkdir(join(repo, "skills", "_archive", "old-skill"), { recursive: true });
    await mkdir(join(repo, ".claude", "worktrees", "feature-a"), { recursive: true });
    await writeFile(join(repo, "skills", "live-skill", "SKILL.md"), "---\nname: live-skill\ndescription: live\n---\n");
    await writeFile(join(repo, "skills", "_archive", "old-skill", "SKILL.md"), "---\nname: old\n---\n");

    const output = await captureRun(["--json"]);
    const report = JSON.parse(output) as Record<string, any>;

    expect(report.caveman.defaultMode).toBe("normal");
    expect(report.caveman.defaultModeSource).toBe("env");
    expect(report.caveman.configPath).toBe(join(process.env["XDG_CONFIG_HOME"]!, "caveman", "config.json"));
    const codexCaveman = report.caveman.agents.find((agent: { label: string }) => agent.label === "Codex CLI");
    expect(codexCaveman.activationHookPresent).toBe(true);
    expect(report.policy).toMatchObject({ path: policyPath, exists: true, size: "[commands]\n".length });
    const rgTool = report.tools.find((tool: { cmd: string }) => tool.cmd === "rg");
    expect(rgTool.present).toBe(true);
    expect(String(rgTool.path)).toContain("rg");
    expect(report.skillsCount).toBe(1);
    expect(report.worktrees.projectLocalIgnoredRoots).toEqual([{
      path: join(repo, ".claude", "worktrees"),
      entries: ["feature-a"],
    }]);
  });

  test("surfaces malformed caveman config when env default is absent", async () => {
    await mkdir(join(process.env["XDG_CONFIG_HOME"]!, "caveman"), { recursive: true });
    await writeFile(join(process.env["XDG_CONFIG_HOME"]!, "caveman", "config.json"), JSON.stringify({ defaultMode: 123 }));

    const report = JSON.parse(await captureRun(["--json"])) as Record<string, any>;

    expect(report.caveman.defaultMode).toBe("");
    expect(report.caveman.defaultModeSource).toBe("malformed");
  });

  test("checks MCP reachability, auth wiring, drift, and probe handshake in JSON output", async () => {
    const home = process.env["HOME"]!;
    const originalFetch = globalThis.fetch;
    await mkdir(join(home, ".codex"), { recursive: true });
    await registerServer("private-http", {
      transport: "http",
      url: "https://mcp.example.test/rpc",
      description: "private test MCP",
      vendor: "test",
      default_enabled: false,
      auth_env_vars: ["PRIVATE_MCP_TOKEN"],
      agent_visibility: {
        "claude-code": false,
        codex: true,
        gemini: false,
        opencode: false,
        pi: false,
      },
    });
    await setEnabled("private-http", true, { agents: ["codex"] });
    await writeFile(join(home, ".codex", "config.toml"), [
      "# BEGIN FULCRUM MCP private-http",
      "[mcp_servers.private-http]",
      "url = \"https://mcp.example.test/rpc\"",
      "# END FULCRUM MCP private-http",
      "",
    ].join("\n"));
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://mcp.example.test/rpc");
      expect(init?.method === "HEAD" || init?.method === "POST").toBe(true);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), { status: 200 });
    }) as typeof fetch;

    try {
      const report = JSON.parse(await captureRun(["--json", "--probe"])) as Record<string, any>;
      const server = report.mcp.servers.find((entry: { name: string }) => entry.name === "private-http");
      expect(server).toMatchObject({
        transport: "http",
        vendor: "test",
        auth_status: "missing-env",
        reachable: true,
        drift: true,
        handshake: "ok",
      });
      expect(server.agent_state.codex).toBe("enabled");
      expect(server.wiring.codex).toBe("missing");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("delegates non-api subsystem requests to the modular doctor", async () => {
    const output = await captureRun(["--subsystem", "memory", "--json"]);
    const parsed = JSON.parse(output) as { subsystem?: string; checks?: unknown[]; summary?: unknown };

    expect(parsed.subsystem ?? "memory").toBe("memory");
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.summary).toBeDefined();
  });
});
