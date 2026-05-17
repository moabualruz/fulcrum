import { readdir, readFile, stat } from "node:fs/promises";
import { isEnabled, loadRegistry, type AgentId } from "./mcp-registry.ts";
import type { AgentSurfaceTarget, PackageSurfaceKind, PackageSurfaceManifest } from "./package-surfaces.ts";

export interface PackageParityReport {
  packageId: string;
  agentId: AgentId | "mixed";
  sourceCounts: Record<PackageSurfaceKind, number>;
  installedCounts: Record<PackageSurfaceKind, number>;
  missing: readonly AgentSurfaceTarget[];
  missingReasons: readonly PackageParityMissingReason[];
  unsupported: readonly AgentSurfaceTarget[];
  leakedSourceOnlyFiles: readonly string[];
  ok: boolean;
}

export interface PackageParityMissingReason {
  agentId: AgentId;
  kind: PackageSurfaceKind;
  targetPath?: string;
  owned: boolean;
  nativeExists: boolean;
  ledgerExists: boolean;
  status: "missing-native-root" | "missing-target";
  reason: "missing-native-root" | "missing-target";
}

const SURFACE_KINDS: readonly PackageSurfaceKind[] = [
  "skill",
  "rule",
  "mcp",
  "command",
  "agent",
  "hook",
  "tool",
  "metadata",
  "asset",
];

export async function auditPackageParity(
  manifest: PackageSurfaceManifest,
  targets: readonly AgentSurfaceTarget[],
  opts: { home?: string } = {},
): Promise<PackageParityReport> {
  const home = opts.home ?? process.env["HOME"] ?? "";
  const sourceCounts = emptyCounts();
  const installedCounts = emptyCounts();
  const missing: AgentSurfaceTarget[] = [];
  const missingReasons: PackageParityMissingReason[] = [];
  const unsupported: AgentSurfaceTarget[] = [];
  const leakRoots = new Set<string>();

  for (const surface of manifest.surfaces) {
    sourceCounts[surface.kind] += 1;
  }

  for (const target of targets) {
    if (target.support === "unsupported") {
      unsupported.push(target);
      continue;
    }
    if (target.support === "native") {
      if (await nativePackageInstalled(manifest.packageId, target.agentId, home)) {
        installedCounts[target.surface.kind] += 1;
      } else {
        missing.push(target);
        missingReasons.push({
          agentId: target.agentId,
          kind: target.surface.kind,
          owned: false,
          nativeExists: false,
          ledgerExists: false,
          status: "missing-native-root",
          reason: "missing-native-root",
        });
      }
      continue;
    }
    const targetPaths = [target.targetPath, ...(target.additionalTargetPaths ?? [])].filter((path): path is string => !!path);
    if (targetPaths.length === 0) {
      missing.push(target);
      missingReasons.push({
        agentId: target.agentId,
        kind: target.surface.kind,
        owned: false,
        nativeExists: false,
        ledgerExists: false,
        status: "missing-target",
        reason: "missing-target",
      });
      continue;
    }
    const expandedPaths = targetPaths.map((path) => expandHome(path, home));
    for (const path of expandedPaths) {
      leakRoots.add(mirrorRoot(path, target.surface.relativePath));
    }
    const allPathsPresent = (await Promise.all(expandedPaths.map((path) => exists(path)))).every(Boolean);
    const nativeConfigPresent = target.surface.kind === "mcp"
      ? await mcpManifestConfigured(target, home)
      : true;
    if (allPathsPresent && nativeConfigPresent) {
      installedCounts[target.surface.kind] += 1;
    } else {
      missing.push(target);
      missingReasons.push({
        agentId: target.agentId,
        kind: target.surface.kind,
        targetPath: target.targetPath,
        owned: false,
        nativeExists: allPathsPresent,
        ledgerExists: false,
        status: "missing-target",
        reason: "missing-target",
      });
    }
  }

  const leakedSourceOnlyFiles = (await Promise.all([...leakRoots].map((root) => findSourceOnlyLeaks(root))))
    .flat()
    .sort();

  return {
    packageId: manifest.packageId,
    agentId: singleAgent(targets),
    sourceCounts,
    installedCounts,
    missing,
    missingReasons,
    unsupported,
    leakedSourceOnlyFiles,
    ok: missing.length === 0 && leakedSourceOnlyFiles.length === 0,
  };
}

function emptyCounts(): Record<PackageSurfaceKind, number> {
  return Object.fromEntries(SURFACE_KINDS.map((kind) => [kind, 0])) as Record<PackageSurfaceKind, number>;
}

function singleAgent(targets: readonly AgentSurfaceTarget[]): AgentId | "mixed" {
  const agents = new Set(targets.map((target) => target.agentId));
  return agents.size === 1 ? targets[0]?.agentId ?? "mixed" : "mixed";
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function nativePackageInstalled(packageId: string, agentId: AgentId, home: string): Promise<boolean> {
  if (agentId === "claude-code") {
    const pluginRoots: Record<string, string[]> = {
      "package.caveman": [
        `${home}/.claude/plugins/cache/caveman`,
        `${home}/.claude/plugins/cache/caveman/caveman`,
      ],
      "package.cloudflare": [`${home}/.claude/plugins/cache/cloudflare`],
      "package.superpowers": [
        `${home}/.claude/plugins/cache/claude-plugins-official/superpowers`,
        `${home}/.claude/plugins/cache/superpowers`,
      ],
    };
    return (await Promise.all((pluginRoots[packageId] ?? []).map((path) => exists(path)))).some(Boolean);
  }

  if (packageId === "package.caveman" && agentId === "gemini") {
    return exists(`${home}/.gemini/extensions/caveman`);
  }
  if (packageId === "package.superpowers" && agentId === "gemini") {
    return exists(`${home}/.gemini/extensions/superpowers`);
  }
  if (packageId === "package.superpowers" && agentId === "opencode") {
    return jsonArrayContains(`${home}/.config/opencode/opencode.json`, "plugin", "superpowers@git+https://github.com/obra/superpowers.git");
  }
  if (packageId === "package.superpowers" && agentId === "pi") {
    return jsonArrayContains(`${home}/.pi/agent/settings.json`, "packages", "https://github.com/obra/superpowers");
  }
  return false;
}

async function jsonArrayContains(path: string, key: string, value: string): Promise<boolean> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    const root = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
    const array = root[key];
    return Array.isArray(array) && array.includes(value);
  } catch {
    return false;
  }
}

async function mcpManifestConfigured(target: AgentSurfaceTarget, home: string): Promise<boolean> {
  if (target.configMutation === undefined) return true;
  if (!(await exists(target.surface.sourcePath))) return true;
  const serverNames = await packageMcpServerNames(target.surface.sourcePath);
  if (serverNames.length === 0) return true;
  for (const name of serverNames) {
    if (await nativeMcpConfigContains(home, target.agentId, name)) continue;
    if (await disabledRegistryMcpAccepted(target.agentId, name)) continue;
    return false;
  }
  return true;
}

async function disabledRegistryMcpAccepted(agentId: AgentId, name: string): Promise<boolean> {
  // Codex/Gemini/OpenCode support explicit disabled native MCP config, so parity
  // requires that config. Claude/Pi do not; disabled registry state is the only
  // safe installed-but-off representation for those agents.
  if (agentId === "codex" || agentId === "gemini" || agentId === "opencode") return false;
  const reg = await loadRegistry();
  const server = reg.servers[name];
  return server !== undefined && !isEnabled(server, agentId);
}

async function packageMcpServerNames(path: string): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    const root = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
    const mcpServers = root["mcpServers"];
    if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) return [];
    return Object.keys(mcpServers as Record<string, unknown>);
  } catch {
    return [];
  }
}

async function nativeMcpConfigContains(home: string, agentId: AgentId, name: string): Promise<boolean> {
  if (agentId === "codex") {
    const path = `${home}/.codex/config.toml`;
    return await fileContains(path, `[mcp_servers.${name}]`);
  }
  const path =
    agentId === "gemini" ? `${home}/.gemini/settings.json` :
    agentId === "opencode" ? `${home}/.config/opencode/opencode.json` :
    agentId === "pi" ? `${home}/.pi/agent/mcp.json` :
    `${home}/.claude.json`;
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    const root = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
    const section = agentId === "opencode" ? root["mcp"] : root["mcpServers"];
    return !!section && typeof section === "object" && !Array.isArray(section) && name in (section as Record<string, unknown>);
  } catch {
    return false;
  }
}

async function fileContains(path: string, needle: string): Promise<boolean> {
  try {
    return (await readFile(path, "utf8")).includes(needle);
  } catch {
    return false;
  }
}

function expandHome(path: string, home: string): string {
  return path.startsWith("~/") ? `${home}/${path.slice(2)}` : path;
}

function mirrorRoot(path: string, relativePath: string): string {
  const normalizedRelative = relativePath.replace(/\\/g, "/");
  const normalizedPath = path.replace(/\\/g, "/");
  if (normalizedPath.endsWith(normalizedRelative)) {
    return normalizedPath.slice(0, -normalizedRelative.length).replace(/\/+$/, "");
  }
  const parts = normalizedPath.split("/");
  parts.pop();
  return parts.join("/");
}

async function findSourceOnlyLeaks(root: string): Promise<string[]> {
  if (!(await exists(root))) return [];
  const leaks: string[] = [];
  async function visit(dir: string): Promise<void> {
    let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[];
    try {
      entries = await readdir(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = String(entry.name);
      const path = `${dir}/${name}`;
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && (name.endsWith(".original.md") || name.endsWith(".backup.md"))) {
        leaks.push(path);
      }
    }
  }
  await visit(root);
  return leaks;
}
