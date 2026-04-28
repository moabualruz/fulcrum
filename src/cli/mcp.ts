// DeepWiki MCP registration.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { which, run as runProc } from "../utils/proc.ts";

const URL = "https://mcp.deepwiki.com/mcp";
const BEGIN = "# BEGIN FULCRUM MCP deepwiki";
const END = "# END FULCRUM MCP deepwiki";

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
  const block = `${BEGIN}\n[mcp_servers.deepwiki]\nurl = "${URL}"\n${END}\n`;
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
      if (dryRun) console.log(`     [dry-run] would run: claude mcp add -s user deepwiki --transport http ${URL}`);
      else await runProc(["claude", "mcp", "add", "-s", "user", "deepwiki", "--transport", "http", URL]);
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
    await installJson(`${home}/.gemini/settings.json`, "mcpServers", { httpUrl: URL }, "Gemini", dryRun);
  } else {
    console.log("     · skip Gemini DeepWiki MCP (not detected)");
  }
  if (await exists(`${home}/.config/opencode`)) {
    await installJson(`${home}/.config/opencode/opencode.json`, "mcp", { type: "remote", url: URL }, "OpenCode", dryRun);
  } else {
    console.log("     · skip OpenCode DeepWiki MCP (not detected)");
  }
  console.log("     · skip Pi CLI DeepWiki MCP (pi-mcp-adapter support is documented but not Fulcrum-managed yet)");
}

export async function uninstallDeepwikiMcp(opts: { dryRun?: boolean } = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = process.env["HOME"] ?? "";
  await removeTomlBlock(`${home}/.codex/config.toml`, dryRun);
  await removeJson(`${home}/.gemini/settings.json`, "mcpServers", "Gemini", dryRun);
  await removeJson(`${home}/.config/opencode/opencode.json`, "mcp", "OpenCode", dryRun);
  console.log("     · Claude Code MCP removal remains manual: claude mcp remove -s user deepwiki");
}
