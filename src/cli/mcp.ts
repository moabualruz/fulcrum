// DeepWiki MCP registration.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { which, run as runProc } from "../utils/proc.ts";

const DEEPWIKI_URL = "https://mcp.deepwiki.com/mcp";
const BEGIN = "# BEGIN FULCRUM MCP deepwiki";
const END = "# END FULCRUM MCP deepwiki";
const PI_MCP_ADAPTER_PKG = "npm:pi-mcp-adapter";

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function readText(p: string): Promise<string> {
  return (await exists(p)) ? readFile(p, "utf8") : Promise.resolve("");
}

async function writeText(p: string, body: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(`     [dry-run] would write: ${p}`);
    return;
  }
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, body);
}

async function installTomlBlock(file: string, dryRun: boolean): Promise<void> {
  const existing = await readText(file);
  if (existing.includes("[mcp_servers.deepwiki]") || existing.includes(BEGIN)) {
    console.log(`     · Codex DeepWiki MCP already present: ${file}`);
    return;
  }
  const block = `${BEGIN}\n[mcp_servers.deepwiki]\nurl = "${DEEPWIKI_URL}"\n${END}\n`;
  const sep = existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "";
  await writeText(file, `${existing}${sep}${block}`, dryRun);
  console.log(`     ✓ Codex DeepWiki MCP registered: ${file}`);
}

async function removeTomlBlock(file: string, dryRun: boolean): Promise<void> {
  if (!(await exists(file))) {
    console.log(`     · Codex config not present`);
    return;
  }
  const existing = await readText(file);
  if (!existing.includes(BEGIN)) {
    console.log(`     · Codex DeepWiki MCP not Fulcrum-managed`);
    return;
  }
  const re = new RegExp(`\\n?${BEGIN}[\\s\\S]*?${END}\\n?`, "m");
  const out = existing.replace(re, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  await writeText(file, out ? `${out}\n` : "", dryRun);
  console.log(`     - Codex DeepWiki MCP removed: ${file}`);
}

async function readJsonObject(file: string): Promise<Record<string, unknown> | null> {
  if (!(await exists(file))) return {};
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function installJson(file: string, key: "mcpServers" | "mcp", value: Record<string, unknown>, label: string, dryRun: boolean): Promise<void> {
  const root = await readJsonObject(file);
  if (!root) {
    console.log(`     ✗ ${label} config is not JSON; skipped: ${file}`);
    return;
  }
  const section = root[key];
  const obj = section && typeof section === "object" && !Array.isArray(section)
    ? section as Record<string, unknown>
    : {};
  if (obj["deepwiki"]) {
    console.log(`     · ${label} DeepWiki MCP already present: ${file}`);
    return;
  }
  obj["deepwiki"] = value;
  root[key] = obj;
  await writeText(file, JSON.stringify(root, null, 2) + "\n", dryRun);
  console.log(`     ✓ ${label} DeepWiki MCP registered: ${file}`);
}

async function removeJson(file: string, key: "mcpServers" | "mcp", label: string, dryRun: boolean): Promise<void> {
  const root = await readJsonObject(file);
  if (!root) {
    console.log(`     · ${label} config not present or not JSON`);
    return;
  }
  const section = root[key];
  if (!section || typeof section !== "object" || Array.isArray(section) || !(section as Record<string, unknown>)["deepwiki"]) {
    console.log(`     · ${label} DeepWiki MCP not present`);
    return;
  }
  delete (section as Record<string, unknown>)["deepwiki"];
  await writeText(file, JSON.stringify(root, null, 2) + "\n", dryRun);
  console.log(`     - ${label} DeepWiki MCP removed: ${file}`);
}

export async function installDeepwikiMcp(opts: { dryRun?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = process.env["HOME"] ?? "";

  const claudeDir = `${home}/.claude`;
  if (await exists(claudeDir)) {
    if (await which("claude")) {
      if (dryRun) console.log(`     [dry-run] would run: claude mcp add -s user deepwiki --transport http ${DEEPWIKI_URL}`);
      else await runProc(["claude", "mcp", "add", "-s", "user", "deepwiki", "--transport", "http", DEEPWIKI_URL], { timeoutMs: 60_000 });
      console.log("     ✓ Claude Code DeepWiki MCP requested");
    } else {
      console.log("     · skip Claude Code DeepWiki MCP (claude not on PATH)");
    }
  } else {
    console.log("     · skip Claude Code DeepWiki MCP (not detected)");
  }

  if (await exists(`${home}/.codex`)) {
    await installTomlBlock(`${home}/.codex/config.toml`, dryRun);
  } else {
    console.log("     · skip Codex CLI DeepWiki MCP (not detected)");
  }
  if (await exists(`${home}/.gemini`)) {
    await installJson(`${home}/.gemini/settings.json`, "mcpServers", { httpUrl: DEEPWIKI_URL }, "Gemini", dryRun);
  } else {
    console.log("     · skip Gemini DeepWiki MCP (not detected)");
  }
  if (await exists(`${home}/.config/opencode`)) {
    await installJson(`${home}/.config/opencode/opencode.json`, "mcp", { type: "remote", url: DEEPWIKI_URL }, "OpenCode", dryRun);
  } else {
    console.log("     · skip OpenCode DeepWiki MCP (not detected)");
  }
  if (await exists(`${home}/.pi/agent`)) {
    await installPiDeepwikiAdapter({ dryRun });
  } else {
    console.log("     · skip Pi CLI DeepWiki MCP (not detected)");
  }
}

export async function uninstallDeepwikiMcp(opts: { dryRun?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = process.env["HOME"] ?? "";
  await removeTomlBlock(`${home}/.codex/config.toml`, dryRun);
  await removeJson(`${home}/.gemini/settings.json`, "mcpServers", "Gemini", dryRun);
  await removeJson(`${home}/.config/opencode/opencode.json`, "mcp", "OpenCode", dryRun);
  await uninstallPiDeepwikiAdapter({ dryRun });
  console.log("     · Claude Code MCP removal remains manual: claude mcp remove -s user deepwiki");
}

// ── Pi DeepWiki adapter ────────────────────────────────────────────────────

/**
 * Install pi-mcp-adapter (if not already in settings.json packages) and write
 * deepwiki entry into ~/.pi/agent/mcp.json. Idempotent; skips if pi not on PATH.
 */
export async function installPiDeepwikiAdapter(opts: { dryRun?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = process.env["HOME"] ?? "";
  const agentDir = `${home}/.pi/agent`;

  if (!(await exists(agentDir))) {
    console.log("     · skip Pi DeepWiki adapter (not detected)");
    return;
  }

  // 1. Ensure pi-mcp-adapter is in settings.json packages.
  const settingsFile = `${agentDir}/settings.json`;
  const settings = await readJsonObject(settingsFile);
  if (!settings) {
    console.log(`     ✗ Pi settings is not JSON; skipped: ${settingsFile}`);
    return;
  }

  const packages = settings["packages"];
  const pkgArray: string[] = Array.isArray(packages) ? packages as string[] : [];
  const alreadyHasAdapter = pkgArray.includes(PI_MCP_ADAPTER_PKG);

  if (!alreadyHasAdapter) {
    if (await which("pi")) {
      if (dryRun) console.log(`     [dry-run] would run: pi install ${PI_MCP_ADAPTER_PKG}`);
      else {
        const r = await runProc(["pi", "install", PI_MCP_ADAPTER_PKG], { timeoutMs: 60_000 });
        if (r.exit === 0) console.log("     ✓ Pi pi-mcp-adapter install requested");
        else console.log(`     ✗ Pi pi-mcp-adapter install failed: ${r.stderr.trim()}`);
      }
    } else {
      console.log("     · skip pi install pi-mcp-adapter (pi not on PATH)");
    }
    pkgArray.push(PI_MCP_ADAPTER_PKG);
    settings["packages"] = pkgArray;
    await writeText(settingsFile, JSON.stringify(settings, null, 2) + "\n", dryRun);
    console.log(`     ✓ Pi pi-mcp-adapter registered in settings: ${settingsFile}`);
  } else {
    console.log(`     · Pi pi-mcp-adapter already in settings: ${settingsFile}`);
  }

  // 2. Write deepwiki entry into ~/.pi/agent/mcp.json (preserve other servers).
  const mcpFile = `${agentDir}/mcp.json`;
  const mcpRoot = await readJsonObject(mcpFile);
  if (!mcpRoot) {
    console.log(`     ✗ Pi MCP config is not JSON; skipped: ${mcpFile}`);
    return;
  }
  const servers = mcpRoot["mcpServers"];
  const serversObj: Record<string, unknown> =
    servers && typeof servers === "object" && !Array.isArray(servers)
      ? servers as Record<string, unknown>
      : {};
  const existingDeepwiki = serversObj["deepwiki"];
  if (existingDeepwiki) {
    if (existingDeepwiki && typeof existingDeepwiki === "object" && !Array.isArray(existingDeepwiki)) {
      serversObj["deepwiki"] = { ...(existingDeepwiki as Record<string, unknown>), directTools: true };
      mcpRoot["mcpServers"] = serversObj;
      await writeText(mcpFile, JSON.stringify(mcpRoot, null, 2) + "\n", dryRun);
      console.log(`     ✓ Pi DeepWiki MCP updated: ${mcpFile}`);
      return;
    }
    console.log(`     · Pi DeepWiki MCP already present: ${mcpFile}`);
    return;
  }
  serversObj["deepwiki"] = { url: DEEPWIKI_URL, directTools: true };
  mcpRoot["mcpServers"] = serversObj;
  await writeText(mcpFile, JSON.stringify(mcpRoot, null, 2) + "\n", dryRun);
  console.log(`     ✓ Pi DeepWiki MCP registered: ${mcpFile}`);
}

/**
 * Remove deepwiki entry from ~/.pi/agent/mcp.json.
 * Drops mcpServers key if it becomes empty. Does NOT uninstall pi-mcp-adapter
 * (no upstream uninstall contract).
 */
export async function uninstallPiDeepwikiAdapter(opts: { dryRun?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = process.env["HOME"] ?? "";
  const mcpFile = `${home}/.pi/agent/mcp.json`;

  if (!(await exists(`${home}/.pi/agent`))) {
    console.log("     · skip Pi DeepWiki adapter uninstall (not detected)");
    return;
  }

  const mcpRoot = await readJsonObject(mcpFile);
  if (!mcpRoot) {
    console.log("     · Pi MCP config not present or not JSON");
    return;
  }
  const servers = mcpRoot["mcpServers"];
  if (!servers || typeof servers !== "object" || Array.isArray(servers) || !(servers as Record<string, unknown>)["deepwiki"]) {
    console.log("     · Pi DeepWiki MCP not present");
    return;
  }
  delete (servers as Record<string, unknown>)["deepwiki"];
  // Drop empty mcpServers key.
  if (Object.keys(servers as Record<string, unknown>).length === 0) {
    delete mcpRoot["mcpServers"];
  }
  await writeText(mcpFile, JSON.stringify(mcpRoot, null, 2) + "\n", dryRun);
  console.log(`     - Pi DeepWiki MCP removed: ${mcpFile}`);
}
