import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installContextMode, uninstallContextMode } from "./context-mode.ts";

let TMP: string;
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;

async function writeFixture(path: string, body: string): Promise<void> {
  await mkdir(join(TMP, "context-mode", "configs", path.split("/").slice(0, -1).join("/")), { recursive: true });
  await writeFile(join(TMP, "context-mode", "configs", path), body);
}

async function buildContextModeFixture(): Promise<string> {
  await writeFixture("claude-code/CLAUDE.md", "# context-mode claude\n");
  await writeFixture("codex/AGENTS.md", "# context-mode codex\n");
  await writeFixture("gemini-cli/GEMINI.md", "# context-mode gemini\n");
  await writeFixture("opencode/AGENTS.md", "# context-mode opencode\n");
  await writeFixture("pi/AGENTS.md", "# context-mode pi\n");
  return join(TMP, "context-mode");
}

async function setupAgents(): Promise<void> {
  await mkdir(join(TMP, ".claude"), { recursive: true });
  await mkdir(join(TMP, ".codex"), { recursive: true });
  await mkdir(join(TMP, ".gemini"), { recursive: true });
  await mkdir(join(TMP, ".config", "opencode"), { recursive: true });
  await mkdir(join(TMP, ".pi", "agent"), { recursive: true });
  await writeFile(join(TMP, ".codex", "AGENTS.md"), "codex user rules\n");
  await writeFile(join(TMP, ".config", "opencode", "opencode.json"), JSON.stringify({ plugin: ["user-plugin"] }, null, 2) + "\n");
}

beforeEach(async () => {
  TMP = await mkdtemp(join(tmpdir(), "fulcrum-context-mode-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = TMP;
  process.env["FULCRUM_HOME"] = join(TMP, ".fulcrum");
});

afterEach(async () => {
  if (originalHome !== undefined) process.env["HOME"] = originalHome;
  else delete process.env["HOME"];
  if (originalFulcrumHome !== undefined) process.env["FULCRUM_HOME"] = originalFulcrumHome;
  else delete process.env["FULCRUM_HOME"];
  await rm(TMP, { recursive: true, force: true });
});

describe("context-mode managed install", () => {
  test("installs MCP, hooks, package entries, and routing rules for supported agents", async () => {
    const cloneDir = await buildContextModeFixture();
    await setupAgents();

    await installContextMode({ cloneDir, skipBinaryInstall: true, skipExternalCommands: true });

    expect(await readFile(join(TMP, ".codex", "config.toml"), "utf8")).toContain("[mcp_servers.context-mode]");
    const codexHooks = JSON.parse(await readFile(join(TMP, ".codex", "hooks.json"), "utf8"));
    expect(codexHooks.hooks.PreToolUse[0].hooks[0].command).toBe("context-mode hook codex pretooluse");

    const gemini = JSON.parse(await readFile(join(TMP, ".gemini", "settings.json"), "utf8"));
    expect(gemini.mcpServers["context-mode"].command).toBe("context-mode");
    expect(gemini.hooks.SessionStart[0].hooks[0].command).toBe("context-mode hook gemini-cli sessionstart");

    const opencode = JSON.parse(await readFile(join(TMP, ".config", "opencode", "opencode.json"), "utf8"));
    expect(opencode.mcp["context-mode"].command).toEqual(["context-mode"]);
    expect(opencode.plugin).toContain("context-mode");
    expect(opencode.plugin).toContain("user-plugin");

    const piSettings = JSON.parse(await readFile(join(TMP, ".pi", "agent", "settings.json"), "utf8"));
    expect(piSettings.packages).toContain("npm:context-mode");
    const piMcp = JSON.parse(await readFile(join(TMP, ".pi", "agent", "mcp.json"), "utf8"));
    expect(piMcp.mcpServers["context-mode"].command).toBe("context-mode");

    expect(await readFile(join(TMP, ".codex", "AGENTS.md"), "utf8")).toContain("<!-- BEGIN FULCRUM CONTEXT-MODE -->");
    expect(await readFile(join(TMP, ".pi", "agent", "AGENTS.md"), "utf8")).toContain("# context-mode pi");
  });

  test("uninstall removes only Fulcrum-managed context-mode registrations", async () => {
    const cloneDir = await buildContextModeFixture();
    await setupAgents();

    await installContextMode({ cloneDir, skipBinaryInstall: true, skipExternalCommands: true });
    await uninstallContextMode({ skipExternalCommands: true });

    const codexConfig = await readFile(join(TMP, ".codex", "config.toml"), "utf8");
    expect(codexConfig).not.toContain("context-mode");
    const codexHooks = JSON.parse(await readFile(join(TMP, ".codex", "hooks.json"), "utf8"));
    expect(codexHooks.hooks.PreToolUse).toEqual([]);
    expect(await readFile(join(TMP, ".codex", "AGENTS.md"), "utf8")).toBe("codex user rules\n");

    const gemini = JSON.parse(await readFile(join(TMP, ".gemini", "settings.json"), "utf8"));
    expect(gemini.mcpServers["context-mode"]).toBeUndefined();
    expect(gemini.hooks.SessionStart).toEqual([]);

    const opencode = JSON.parse(await readFile(join(TMP, ".config", "opencode", "opencode.json"), "utf8"));
    expect(opencode.mcp["context-mode"]).toBeUndefined();
    expect(opencode.plugin).toEqual(["user-plugin"]);

    const piSettings = JSON.parse(await readFile(join(TMP, ".pi", "agent", "settings.json"), "utf8"));
    expect(piSettings.packages).toEqual([]);
    const piMcp = JSON.parse(await readFile(join(TMP, ".pi", "agent", "mcp.json"), "utf8"));
    expect(piMcp.mcpServers["context-mode"]).toBeUndefined();
  });
});
