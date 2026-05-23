import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AGENTS } from "@execution-orchestration/interface/agent-catalog.ts";
import { cloneOrUpdate, run as runProc, which } from "@platform-core/application/runtime-support/process-runner.ts";
import type { AgentId, McpServerSpec, McpServerVisibility } from "./mcp-registry.ts";

const CLOUDFLARE_MARKETPLACE = "cloudflare/skills";
const CLOUDFLARE_REPO = "https://github.com/cloudflare/skills";
const CLOUDFLARE_PLUGIN = "cloudflare@cloudflare";
const CLOUDFLARE_CLAUDE_MARKER = "cloudflare-claude.installed";
const CLOUDFLARE_MIRROR_MARKER = "cloudflare-mirrors.installed";

const SUPERPOWERS_REPO = "https://github.com/obra/superpowers";
const SUPERPOWERS_CLAUDE_PLUGIN = "superpowers@claude-plugins-official";
const SUPERPOWERS_GEMINI_EXTENSION = "https://github.com/obra/superpowers";
const SUPERPOWERS_OPENCODE_PLUGIN = "superpowers@git+https://github.com/obra/superpowers.git";
const SUPERPOWERS_CLAUDE_MARKER = "superpowers-claude.installed";
const SUPERPOWERS_GEMINI_MARKER = "superpowers-gemini.installed";
const SUPERPOWERS_OPENCODE_MARKER = "superpowers-opencode.installed";
const SUPERPOWERS_PI_MARKER = "superpowers-pi.installed";
const SUPERPOWERS_CODEX_MIRROR_MARKER = "superpowers-codex-mirror.installed";
const SUPERPOWERS_PI_MIRROR_MARKER = "superpowers-pi-mirror.installed";
const PACKAGE_MIRROR_METADATA = "fulcrum-package-mirror.json";
const PACKAGE_MIRROR_VERSION = "1.0.0";
const SUPERPOWERS_PI_PACKAGES = [
  "https://github.com/obra/superpowers",
  "npm:@tintinweb/pi-subagents",
  "npm:@uadgj/pi-superpowers-support",
] as const;

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

async function isDir(path: string): Promise<boolean> {
  try { return (await stat(path)).isDirectory(); } catch { return false; }
}

function homeDir(): string {
  return process.env["HOME"] ?? "";
}

function fulcrumHome(home: string): string {
  return process.env["FULCRUM_HOME"] ?? `${home}/.fulcrum`;
}

function markerPath(home: string, marker: string): string {
  return `${fulcrumHome(home)}/state/global/${marker}`;
}

async function hasMarker(home: string, marker: string): Promise<boolean> {
  return exists(markerPath(home, marker));
}

async function writeMarker(home: string, marker: string, dryRun: boolean): Promise<void> {
  const path = markerPath(home, marker);
  if (dryRun) {
    console.log(`     [dry-run] would write marker: ${path}`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, new Date().toISOString() + "\n");
}

async function removeMarker(home: string, marker: string, label: string, dryRun: boolean): Promise<void> {
  await removePath(markerPath(home, marker), `${label} marker`, dryRun);
}

async function runBestEffort(cmd: string[], label: string, dryRun: boolean): Promise<boolean> {
  if (dryRun) {
    console.log(`     [dry-run] would run: ${cmd.join(" ")}`);
    return true;
  }
  const r = await runProc(cmd, { timeoutMs: 60_000 });
  if (r.exit !== 0) {
    console.log(`     · ${label} failed (exit ${r.exit}): ${r.stderr.trim() || r.stdout.trim()}`);
    return false;
  }
  console.log(`     ✓ ${label}`);
  return true;
}

async function removePath(path: string, label: string, dryRun: boolean): Promise<void> {
  if (!(await exists(path))) {
    console.log(`     · ${label} not present`);
    return;
  }
  if (dryRun) {
    console.log(`     [dry-run] would remove: ${path}`);
    return;
  }
  await rm(path, { recursive: true, force: true });
  console.log(`     - ${label} → ${path}`);
}

async function clonePackage(repo: string, dir: string, dryRun: boolean): Promise<string | null> {
  if (await exists(`${dir}/skills`)) return dir;
  if (dryRun) {
    console.log(`     [dry-run] would clone/update ${repo} → ${dir}`);
    return dir;
  }
  await mkdir(dirname(dir), { recursive: true });
  const r = await cloneOrUpdate(repo, dir);
  if (r.exit !== 0) {
    console.log(`     · ${repo} clone/update failed: ${r.stderr.trim()}`);
    return null;
  }
  return dir;
}

async function copyTree(src: string, dst: string, dryRun: boolean): Promise<void> {
  if (dryRun) console.log(`     [dry-run] would mkdir: ${dst}`);
  else await mkdir(dst, { recursive: true });

  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (
      entry.name.endsWith(".original.md") ||
      entry.name.endsWith(".backup.md") ||
      entry.name === "_archive" ||
      entry.name === "_template" ||
      entry.name === ".claude" ||
      entry.name === ".git" ||
      entry.name === ".github" ||
      entry.name === "node_modules" ||
      entry.name === "tests" ||
      entry.name === "worktrees"
    ) continue;
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyTree(s, d, dryRun);
    } else if (entry.isFile()) {
      if (dryRun) console.log(`     [dry-run] would copy: ${s} → ${d}`);
      else await copyFile(s, d);
    }
  }
}

type PackageName = "cloudflare" | "superpowers";
type MirrorAgentId = "codex" | "gemini" | "opencode" | "pi";
type SkillMirrorAgentId = "codex" | "opencode" | "pi";
type PackageAgentOptions = { dryRun?: boolean; agents?: readonly AgentId[] };

const PACKAGE_SURFACES = [
  { name: "skills", paths: ["skills"] },
  { name: "rules", paths: ["rules", "AGENTS.md", "CLAUDE.md", "GEMINI.md"] },
  { name: "context", paths: ["context", "memory"] },
  { name: "mcp", paths: ["mcp", ".mcp.json", "mcp.json"] },
  { name: "commands", paths: ["commands", "prompts"] },
  { name: "agents", paths: ["agents", "subagents"] },
  { name: "hooks", paths: ["hooks", "hooks.json"] },
  { name: "tools", paths: ["tools", "scripts", "bin"] },
  { name: "metadata", paths: [".claude-plugin", ".codex-plugin", "plugin.json", "extension.json", "package.json", "manifest.json", "gemini-extension.json"] },
  { name: "assets", paths: ["assets", "templates", "themes", "docs", "README.md", "LICENSE"] },
] as const;

function packageMirrorRoot(home: string, packageName: PackageName, agentId: MirrorAgentId): string {
  switch (agentId) {
    case "codex":
      return `${home}/.codex/plugins/cache/${packageName}/${packageName}/${PACKAGE_MIRROR_VERSION}`;
    case "gemini":
      return `${home}/.gemini/extensions/${packageName}`;
    case "opencode":
      return `${home}/.config/opencode/packages/${packageName}`;
    case "pi":
      return `${home}/.pi/agent/packages/${packageName}`;
  }
}

function selectedAgent(agents: readonly AgentId[] | undefined, agentId: AgentId): boolean {
  return agents === undefined || agents.includes(agentId);
}

function selectedMirrorAgents(
  agents: readonly AgentId[] | undefined,
  defaults: readonly MirrorAgentId[],
): MirrorAgentId[] {
  return defaults.filter((agentId) => selectedAgent(agents, agentId));
}

function knownPackageRootEntries(): Set<string> {
  const known = new Set<string>();
  for (const surface of PACKAGE_SURFACES) {
    for (const path of surface.paths) known.add(path.split("/")[0] ?? path);
  }
  return known;
}

async function packageSurfaceNames(sourceRoot: string): Promise<string[]> {
  if (!(await isDir(sourceRoot))) return [];
  const names = new Set<string>();
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    if (
      entry.name.endsWith(".original.md") ||
      entry.name.endsWith(".backup.md") ||
      entry.name === "_archive" ||
      entry.name === "_template" ||
      entry.name === ".git" ||
      entry.name === ".github" ||
      entry.name === "node_modules" ||
      entry.name === "tests" ||
      entry.name === "worktrees"
    ) continue;
    const matched = PACKAGE_SURFACES.find((surface) => (surface.paths as readonly string[]).includes(entry.name));
    names.add(matched?.name ?? "assets");
  }
  return [...names].sort();
}

async function unknownPackageAssets(sourceRoot: string): Promise<string[]> {
  if (!(await isDir(sourceRoot))) return [];
  const known = knownPackageRootEntries();
  const unknown: string[] = [];
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    if (
      entry.name.endsWith(".original.md") ||
      entry.name.endsWith(".backup.md") ||
      entry.name === "_archive" ||
      entry.name === "_template" ||
      entry.name === ".git" ||
      entry.name === ".github" ||
      entry.name === "node_modules" ||
      entry.name === "tests" ||
      entry.name === "worktrees"
    ) continue;
    if (!known.has(entry.name)) unknown.push(entry.name);
  }
  return unknown.sort();
}

async function writeText(path: string, data: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(`     [dry-run] would write: ${path}`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

function unsupportedPackageSurfaces(targetAgent: string, surfaces: readonly string[]): Record<string, string> {
  const unsupported: Record<string, string> = {};
  for (const surface of surfaces) {
    if (surface === "skills" || surface === "assets" || surface === "metadata") continue;
    if (targetAgent === "pi") {
      if (surface === "tools" || surface === "hooks") {
        unsupported[surface] = "mirrored but not auto-executed by Pi fallback";
      } else {
        unsupported[surface] = "mirrored but not auto-loaded by Pi fallback";
      }
    } else if (surface === "tools" || surface === "hooks") {
      unsupported[surface] = `mirrored but not auto-executed by ${targetAgent} fallback`;
    }
  }
  return unsupported;
}

async function writePackageMirrorMetadata(
  targetRoot: string,
  packageName: string,
  targetAgent: string,
  sourceRoot: string,
  dryRun: boolean,
): Promise<void> {
  const mirroredSurfaces = await packageSurfaceNames(sourceRoot);
  const metadata = {
    package: packageName,
    targetAgent,
    sourceRoot,
    mirrorVersion: PACKAGE_MIRROR_VERSION,
    mirroredSurfaces,
    unknownAssets: await unknownPackageAssets(sourceRoot),
    unsupported: unsupportedPackageSurfaces(targetAgent, mirroredSurfaces),
  };
  await writeText(`${targetRoot}/${PACKAGE_MIRROR_METADATA}`, `${JSON.stringify(metadata, null, 2)}\n`, dryRun);
}

async function mirrorPackagePayload(
  sourceRoot: string,
  targetRoot: string,
  packageName: string,
  targetAgent: string,
  dryRun: boolean,
): Promise<void> {
  if (!dryRun) await rm(targetRoot, { recursive: true, force: true });
  await copyTree(sourceRoot, targetRoot, dryRun);
  await writePackageMirrorMetadata(targetRoot, packageName, targetAgent, sourceRoot, dryRun);
}

async function installPackagePayloadMirror(
  home: string,
  packageName: PackageName,
  repo: string,
  sourceRoot: string,
  agentId: MirrorAgentId,
  dryRun: boolean,
): Promise<boolean> {
  const agent = AGENTS.find((a) => a.id === agentId)!;
  if (!(await isDir(agent.rootDir(home)))) {
    console.log(`     · skip ${agent.label} ${packageName} package mirror (not detected)`);
    return false;
  }
  if (!(await isDir(sourceRoot))) {
    console.log(dryRun
      ? `     [dry-run] ${packageName} package mirror unavailable until source exists: ${sourceRoot}`
      : `     · ${packageName} package source unavailable: ${sourceRoot}`);
    return false;
  }
  await mirrorPackagePayload(sourceRoot, packageMirrorRoot(home, packageName, agentId), packageName, agentId, dryRun);
  if (agentId === "gemini") {
    await ensureGeminiExtensionManifest(packageMirrorRoot(home, packageName, agentId), packageName, repo, dryRun);
  }
  console.log(`     ✓ ${agent.label} ${packageName} package payload mirror installed`);
  return true;
}

async function ensureGeminiExtensionManifest(
  targetRoot: string,
  packageName: PackageName,
  repo: string,
  dryRun: boolean,
): Promise<void> {
  const manifestPath = `${targetRoot}/gemini-extension.json`;
  if (await exists(manifestPath)) return;
  await writeText(manifestPath, `${JSON.stringify({
    name: packageName,
    version: PACKAGE_MIRROR_VERSION,
    description: `${packageName} package mirror installed by Fulcrum.`,
    repository: repo,
  }, null, 2)}\n`, dryRun);
}

async function installPackagePayloadMirrors(
  home: string,
  packageName: PackageName,
  repo: string,
  cacheDir: string,
  agentIds: readonly MirrorAgentId[],
  dryRun: boolean,
): Promise<boolean> {
  const detectedResolved: MirrorAgentId[] = [];
  for (const agentId of agentIds) {
    const agent = AGENTS.find((a) => a.id === agentId)!;
    if (await isDir(agent.rootDir(home))) detectedResolved.push(agentId);
  }
  if (detectedResolved.length === 0) {
    console.log(`     · skip ${packageName} package mirrors (no non-native fallback agents detected)`);
    return false;
  }
  const sourceRoot = await clonePackage(repo, cacheDir, dryRun);
  if (!sourceRoot) return false;
  let installed = false;
  for (const agentId of detectedResolved) {
    installed = (await installPackagePayloadMirror(home, packageName, repo, sourceRoot, agentId, dryRun)) || installed;
  }
  if (installed) {
    await installPackageSkillMirrors(home, packageName, sourceRoot, detectedResolved, dryRun);
    await installPackageMcpManifests(home, packageName, sourceRoot, detectedResolved, dryRun);
  }
  return installed;
}

async function removePackagePayloadMirrors(
  home: string,
  packageName: PackageName,
  marker: string,
  agentIds: readonly MirrorAgentId[],
  dryRun: boolean,
  sourceRoot?: string,
): Promise<void> {
  if (!dryRun && !(await hasMarker(home, marker))) {
    console.log(`     · skip ${packageName} package mirrors removal (Fulcrum marker not present)`);
    return;
  }
  if (sourceRoot && await isDir(sourceRoot)) {
    await removePackageMcpManifests(home, packageName, sourceRoot, agentIds, dryRun);
  }
  for (const agentId of agentIds) {
    const agent = AGENTS.find((a) => a.id === agentId)!;
    await removePath(packageMirrorRoot(home, packageName, agentId), `${agent.label} ${packageName} package mirror`, dryRun);
    if (agentId === "codex") {
      await removePath(`${home}/.codex/plugins/cache/${packageName}`, `${agent.label} ${packageName} package cache root`, dryRun);
    }
  }
  await removePackageSkillMirrors(home, packageName, agentIds, dryRun);
  if (!dryRun && await hasRemainingPackagePayloadMirror(home, packageName)) {
    console.log(`     · keep ${packageName} package mirrors marker (other agent mirrors remain)`);
  } else {
    await removeMarker(home, marker, `${packageName} package mirrors`, dryRun);
  }
}

async function hasRemainingPackagePayloadMirror(home: string, packageName: PackageName): Promise<boolean> {
  for (const agentId of ["codex", "gemini", "opencode", "pi"] as const) {
    if (await isDir(packageMirrorRoot(home, packageName, agentId))) return true;
  }
  return false;
}

function skillMirrorAgents(agentIds: readonly MirrorAgentId[]): SkillMirrorAgentId[] {
  return agentIds.filter((agentId): agentId is SkillMirrorAgentId =>
    agentId === "codex" || agentId === "opencode" || agentId === "pi",
  );
}

async function installPackageSkillMirrors(
  home: string,
  packageName: PackageName,
  sourceRoot: string,
  agentIds: readonly MirrorAgentId[],
  dryRun: boolean,
): Promise<void> {
  const sourceSkills = `${sourceRoot}/skills`;
  if (!(await isDir(sourceSkills))) return;

  for (const agentId of skillMirrorAgents(agentIds)) {
    const agent = AGENTS.find((a) => a.id === agentId)!;
    if (!(await isDir(agent.rootDir(home)))) continue;
    const targetRoot = `${agent.skillsDir(home)}/${packageName}`;
    for (const entry of await readdir(sourceSkills, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
      const skillDir = `${sourceSkills}/${entry.name}`;
      if (!(await exists(`${skillDir}/SKILL.md`))) continue;
      const targetSkill = `${targetRoot}/${entry.name}`;
      if (!(await canOverwritePackageMirrorTarget(targetSkill, packageName))) {
        console.log(`     · keep ${agent.label} ${packageName} skill ${entry.name} (not-owned-by-fulcrum)`);
        continue;
      }
      if (!dryRun) await rm(targetSkill, { recursive: true, force: true });
      await copyTree(skillDir, targetSkill, dryRun);
    }
    await writePackageMirrorMetadata(targetRoot, packageName, agentId, sourceRoot, dryRun);
    console.log(`     ✓ ${agent.label} ${packageName} loadable skill mirror installed`);
  }
}

async function canOverwritePackageMirrorTarget(targetPath: string, packageName: PackageName): Promise<boolean> {
  if (!(await exists(targetPath))) return true;
  const markerPath = `${dirname(targetPath)}/${PACKAGE_MIRROR_METADATA}`;
  try {
    const parsed = JSON.parse(await readFile(markerPath, "utf8"));
    return parsed?.package === packageName && parsed?.mirrorVersion === PACKAGE_MIRROR_VERSION;
  } catch {
    return false;
  }
}

async function removePackageSkillMirrors(
  home: string,
  packageName: PackageName,
  agentIds: readonly MirrorAgentId[],
  dryRun: boolean,
): Promise<void> {
  for (const agentId of skillMirrorAgents(agentIds)) {
    const agent = AGENTS.find((a) => a.id === agentId)!;
    await removePath(`${agent.skillsDir(home)}/${packageName}`, `${agent.label} ${packageName} loadable skill mirror`, dryRun);
  }
}

type PackageMcpEntry = Record<string, unknown>;

async function packageMcpManifestPaths(sourceRoot: string): Promise<string[]> {
  const candidates = [`${sourceRoot}/.mcp.json`, `${sourceRoot}/mcp.json`];
  const paths: string[] = [];
  for (const path of candidates) {
    if (await exists(path)) paths.push(path);
  }
  return paths;
}

async function readPackageMcpServers(sourceRoot: string): Promise<Array<{ name: string; spec: PackageMcpEntry }>> {
  const servers: Array<{ name: string; spec: PackageMcpEntry }> = [];
  for (const path of await packageMcpManifestPaths(sourceRoot)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, "utf8"));
    } catch {
      console.log(`     · package MCP manifest is not JSON; skip ${path}`);
      continue;
    }
    const root = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
    const mcpServers = root["mcpServers"];
    if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) continue;
    for (const [name, spec] of Object.entries(mcpServers as Record<string, unknown>)) {
      if (spec && typeof spec === "object" && !Array.isArray(spec)) {
        servers.push({ name, spec: spec as PackageMcpEntry });
      }
    }
  }
  return servers;
}

function visibilityForPackageAgents(agentIds: readonly MirrorAgentId[]): McpServerVisibility {
  const visible: McpServerVisibility = {
    "claude-code": false,
    codex: false,
    gemini: false,
    opencode: false,
    pi: false,
  };
  for (const agentId of agentIds) visible[agentId] = true;
  return visible;
}

function mergeMcpVisibility(
  left: McpServerVisibility,
  right: McpServerVisibility,
): McpServerVisibility {
  return {
    "claude-code": left["claude-code"] || right["claude-code"],
    codex: left.codex || right.codex,
    gemini: left.gemini || right.gemini,
    opencode: left.opencode || right.opencode,
    pi: left.pi || right.pi,
  };
}

function subtractMcpVisibility(
  visibility: McpServerVisibility,
  agentIds: readonly AgentId[],
): McpServerVisibility {
  const next: McpServerVisibility = { ...visibility };
  for (const agentId of agentIds) next[agentId] = false;
  return next;
}

function hasVisibleAgent(visibility: McpServerVisibility): boolean {
  return Object.values(visibility).some(Boolean);
}

function mergePackageMcpSpec(
  existing: { vendor: string; auth_env_vars: string[]; agent_visibility: McpServerVisibility } | undefined,
  packageName: PackageName,
  spec: McpServerSpec,
): McpServerSpec {
  if (!existing || existing.vendor !== packageName) return spec;
  return {
    ...spec,
    auth_env_vars: [...new Set([...existing.auth_env_vars, ...spec.auth_env_vars])].sort(),
    agent_visibility: mergeMcpVisibility(existing.agent_visibility, spec.agent_visibility),
  };
}

function specFromRegisteredPackageMcp(
  server: {
    transport: "http" | "stdio";
    url?: string;
    command?: string;
    description: string;
    vendor: string;
    default_enabled: boolean;
    auth_env_vars: string[];
  },
  agentVisibility: McpServerVisibility,
): McpServerSpec {
  return {
    transport: server.transport,
    url: server.url,
    command: server.command,
    description: server.description,
    vendor: server.vendor,
    default_enabled: server.default_enabled,
    auth_env_vars: server.auth_env_vars,
    agent_visibility: agentVisibility,
  };
}

function packageMcpSpec(
  packageName: PackageName,
  name: string,
  entry: PackageMcpEntry,
  agentIds: readonly MirrorAgentId[],
): McpServerSpec | null {
  const type = String(entry["type"] ?? entry["transport"] ?? "").toLowerCase();
  const url = typeof entry["url"] === "string"
    ? entry["url"]
    : typeof entry["httpUrl"] === "string"
      ? entry["httpUrl"]
      : null;
  if ((type === "http" || type === "sse" || url) && url) {
    return {
      transport: "http",
      url,
      description: `${packageName} package MCP server: ${name}`,
      vendor: packageName,
      default_enabled: false,
      auth_env_vars: packageMcpAuthEnvVars(entry),
      agent_visibility: visibilityForPackageAgents(agentIds),
    };
  }

  const command = typeof entry["command"] === "string" ? entry["command"] : null;
  if ((type === "stdio" || command) && command) {
    const args = Array.isArray(entry["args"]) ? entry["args"].map(String) : [];
    return {
      transport: "stdio",
      command: [command, ...args].join(" "),
      description: `${packageName} package MCP server: ${name}`,
      vendor: packageName,
      default_enabled: false,
      auth_env_vars: packageMcpAuthEnvVars(entry),
      agent_visibility: visibilityForPackageAgents(agentIds),
    };
  }

  console.log(`     · ${packageName} package MCP ${name} has unsupported shape; skip`);
  return null;
}

function packageMcpAuthEnvVars(entry: PackageMcpEntry): string[] {
  const vars = new Set<string>();
  const add = (value: unknown): void => {
    if (typeof value !== "string") return;
    if (/^[A-Z_][A-Z0-9_]*$/.test(value)) vars.add(value);
    for (const match of value.matchAll(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g)) {
      if (match[1]) vars.add(match[1]);
    }
  };

  add(entry["bearer_token_env_var"]);
  add(entry["authorization_env_var"]);
  add(entry["auth_env_var"]);

  const authEnvVars = entry["auth_env_vars"];
  if (Array.isArray(authEnvVars)) {
    for (const value of authEnvVars) add(value);
  } else {
    add(authEnvVars);
  }

  const headers = entry["headers"];
  if (headers && typeof headers === "object" && !Array.isArray(headers)) {
    for (const value of Object.values(headers as Record<string, unknown>)) add(value);
  }

  return [...vars].sort();
}

async function installPackageMcpManifests(
  home: string,
  packageName: PackageName,
  sourceRoot: string,
  agentIds: readonly MirrorAgentId[],
  dryRun: boolean,
): Promise<void> {
  const servers = await readPackageMcpServers(sourceRoot);
  if (servers.length === 0) return;

  if (dryRun) {
    for (const { name } of servers) {
      console.log(`     [dry-run] would register disabled ${packageName} package MCP: ${name}`);
    }
    return;
  }

  const { loadRegistry, registerServer, setEnabled, applyDisabledToAgents } = await import("./mcp-registry.ts");
  for (const { name, spec: entry } of servers) {
    const spec = packageMcpSpec(packageName, name, entry, agentIds);
    if (!spec) continue;
    const existing = (await loadRegistry()).servers[name];
    await registerServer(name, mergePackageMcpSpec(existing, packageName, spec));
    await setEnabled(name, false, { agents: [...agentIds] });
    await applyDisabledToAgents(name, { agents: [...agentIds] });
    console.log(`     ✓ ${packageName} package MCP registered disabled: ${name}`);
  }
}

async function removePackageMcpManifests(
  home: string,
  packageName: PackageName,
  sourceRoot: string,
  agentIds: readonly MirrorAgentId[],
  dryRun: boolean,
): Promise<void> {
  const servers = await readPackageMcpServers(sourceRoot);
  if (servers.length === 0) return;

  if (dryRun) {
    for (const { name } of servers) {
      console.log(`     [dry-run] would remove ${packageName} package MCP: ${name}`);
    }
    return;
  }

  const { BUILTIN_MCPS } = await import("./mcp-builtins.ts");
  const builtins = new Map(BUILTIN_MCPS.map((entry) => [entry.name, entry.spec] as const));
  const { loadRegistry, setEnabled, removeFromAgents, unregisterServer, registerServer } = await import("./mcp-registry.ts");
  for (const { name } of servers) {
    const reg = await loadRegistry();
    const current = reg.servers[name];
    if (!current) continue;
    await setEnabled(name, false, { agents: [...agentIds] });
    await removeFromAgents(name, { agents: [...agentIds] });
    const builtinSpec = builtins.get(name);
    if (builtinSpec) {
      await registerServer(name, builtinSpec);
    } else {
      const remainingVisibility = subtractMcpVisibility(current.agent_visibility, agentIds);
      if (hasVisibleAgent(remainingVisibility)) {
        await registerServer(name, specFromRegisteredPackageMcp(current, remainingVisibility));
      } else {
        await unregisterServer(name);
      }
    }
    console.log(`     - ${packageName} package MCP removed: ${name}`);
  }
}

async function installClaudePlugin(
  home: string,
  label: string,
  pluginName: string,
  dryRun: boolean,
  marker: string,
  marketplace?: string,
): Promise<void> {
  if (!(await isDir(`${home}/.claude`))) {
    console.log(`     · skip ${label} Claude plugin (Claude Code not detected)`);
    return;
  }
  if (dryRun) {
    if (marketplace) {
      await runBestEffort(["claude", "plugin", "marketplace", "add", marketplace], `${label} Claude marketplace add`, true);
    }
    await runBestEffort(["claude", "plugin", "install", pluginName], `${label} Claude plugin install`, true);
    await writeMarker(home, marker, true);
    return;
  }
  if (!(await which("claude"))) {
    const marketplaceHint = marketplace ? `claude plugin marketplace add ${marketplace} && ` : "";
    console.log(`     · skip ${label} Claude plugin (claude not on PATH): manual: ${marketplaceHint}claude plugin install ${pluginName}`);
    return;
  }
  let ok = true;
  if (marketplace) {
    ok = await runBestEffort(["claude", "plugin", "marketplace", "add", marketplace], `${label} Claude marketplace add`, false);
  }
  ok = (await runBestEffort(["claude", "plugin", "install", pluginName], `${label} Claude plugin install`, false)) && ok;
  if (ok) await writeMarker(home, marker, false);
}

async function uninstallClaudePlugin(home: string, label: string, pluginName: string, dryRun: boolean, marker: string): Promise<void> {
  if (!(await isDir(`${home}/.claude`))) return;
  if (!dryRun && !(await hasMarker(home, marker))) {
    console.log(`     · skip ${label} Claude plugin uninstall (Fulcrum marker not present)`);
    return;
  }
  if (dryRun) {
    await runBestEffort(["claude", "plugin", "uninstall", pluginName], `${label} Claude plugin uninstall`, true);
    if (pluginName === CLOUDFLARE_PLUGIN) {
      await removePath(`${home}/.claude/plugins/cache/cloudflare`, "Cloudflare Claude plugin cache", true);
      await removePath(`${home}/.claude/plugins/marketplaces/cloudflare`, "Cloudflare Claude marketplace cache", true);
    } else if (pluginName === SUPERPOWERS_CLAUDE_PLUGIN) {
      await removePath(`${home}/.claude/plugins/cache/claude-plugins-official/superpowers`, "Superpowers Claude plugin cache", true);
    }
    await removeMarker(home, marker, `${label} Claude plugin`, true);
    return;
  }
  if (!(await which("claude"))) {
    console.log(`     · ${label}: claude not on PATH: manual: claude plugin uninstall ${pluginName}`);
    return;
  }
  if (await runBestEffort(["claude", "plugin", "uninstall", pluginName], `${label} Claude plugin uninstall`, false)) {
    if (pluginName === CLOUDFLARE_PLUGIN) {
      await removePath(`${home}/.claude/plugins/cache/cloudflare`, "Cloudflare Claude plugin cache", dryRun);
      await removePath(`${home}/.claude/plugins/marketplaces/cloudflare`, "Cloudflare Claude marketplace cache", dryRun);
    } else if (pluginName === SUPERPOWERS_CLAUDE_PLUGIN) {
      await removePath(`${home}/.claude/plugins/cache/claude-plugins-official/superpowers`, "Superpowers Claude plugin cache", dryRun);
    }
    await removeMarker(home, marker, `${label} Claude plugin`, false);
  }
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  if (!(await exists(path))) return {};
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function writeJson(path: string, data: Record<string, unknown>, dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(`     [dry-run] would write: ${path}`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n");
}

async function addOpenCodePlugin(home: string, dryRun: boolean): Promise<void> {
  const dir = `${home}/.config/opencode`;
  if (!(await isDir(dir))) {
    console.log("     · skip Superpowers OpenCode plugin (OpenCode not detected)");
    return;
  }
  const file = `${dir}/opencode.json`;
  const cfg = await readJsonObject(file);
  const current = Array.isArray(cfg["plugin"]) ? cfg["plugin"] : [];
  if (!current.includes(SUPERPOWERS_OPENCODE_PLUGIN)) {
    cfg["plugin"] = [...current, SUPERPOWERS_OPENCODE_PLUGIN];
    await writeJson(file, cfg, dryRun);
    await writeMarker(home, SUPERPOWERS_OPENCODE_MARKER, dryRun);
    console.log("     ✓ Superpowers OpenCode plugin registered");
  } else {
    console.log("     · Superpowers OpenCode plugin already registered");
  }
}

async function removeOpenCodePlugin(home: string, dryRun: boolean): Promise<void> {
  const file = `${home}/.config/opencode/opencode.json`;
  if (!(await exists(file))) return;
  if (!dryRun && !(await hasMarker(home, SUPERPOWERS_OPENCODE_MARKER))) {
    console.log("     · skip Superpowers OpenCode plugin removal (Fulcrum marker not present)");
    return;
  }
  const cfg = await readJsonObject(file);
  const plugins = Array.isArray(cfg["plugin"]) ? cfg["plugin"] : null;
  if (!plugins) return;
  cfg["plugin"] = plugins.filter((value) => value !== SUPERPOWERS_OPENCODE_PLUGIN);
  if ((cfg["plugin"] as unknown[]).length === 0) delete cfg["plugin"];
  await writeJson(file, cfg, dryRun);
  await removeMarker(home, SUPERPOWERS_OPENCODE_MARKER, "Superpowers OpenCode plugin", dryRun);
  console.log("     - Superpowers OpenCode plugin registration removed");
}

async function installGeminiSuperpowers(home: string, dryRun: boolean): Promise<void> {
  const geminiDir = `${home}/.gemini`;
  const extensionDir = `${geminiDir}/extensions/superpowers`;
  if (!(await isDir(geminiDir))) {
    console.log("     · skip Superpowers Gemini extension (Gemini not detected)");
    return;
  }
  if (await isDir(extensionDir)) {
    console.log("     · Superpowers Gemini extension already installed");
    return;
  }
  if (dryRun) {
    await runBestEffort(
      ["gemini", "extensions", "install", SUPERPOWERS_GEMINI_EXTENSION, "--consent", "--skip-settings"],
      "Superpowers Gemini extension install",
      true,
    );
    await writeMarker(home, SUPERPOWERS_GEMINI_MARKER, true);
    return;
  }
  if (!(await which("gemini"))) {
    console.log(`     · skip Superpowers Gemini extension (gemini not on PATH): manual: gemini extensions install ${SUPERPOWERS_GEMINI_EXTENSION} --consent --skip-settings`);
    return;
  }
  await runBestEffort(
    ["gemini", "extensions", "install", SUPERPOWERS_GEMINI_EXTENSION, "--consent", "--skip-settings"],
    "Superpowers Gemini extension install",
    dryRun,
  ) && await writeMarker(home, SUPERPOWERS_GEMINI_MARKER, false);
}

async function uninstallGeminiSuperpowers(home: string, dryRun: boolean): Promise<void> {
  const extensionDir = `${home}/.gemini/extensions/superpowers`;
  if (!(await exists(extensionDir))) {
    console.log("     · Superpowers Gemini extension not present");
    return;
  }
  if (!dryRun && !(await hasMarker(home, SUPERPOWERS_GEMINI_MARKER))) {
    console.log("     · skip Superpowers Gemini extension uninstall (Fulcrum marker not present)");
    return;
  }
  if (dryRun) {
    await runBestEffort(["gemini", "extensions", "uninstall", "superpowers"], "Superpowers Gemini extension uninstall", true);
    await removePath(extensionDir, "Superpowers Gemini extension", true);
    await removeMarker(home, SUPERPOWERS_GEMINI_MARKER, "Superpowers Gemini extension", true);
    return;
  }
  if (await which("gemini")) {
    await runBestEffort(["gemini", "extensions", "uninstall", "superpowers"], "Superpowers Gemini extension uninstall", dryRun);
  } else {
    console.log("     · Superpowers Gemini extension: gemini not on PATH");
  }
  await removePath(extensionDir, "Superpowers Gemini extension", dryRun);
  await removeMarker(home, SUPERPOWERS_GEMINI_MARKER, "Superpowers Gemini extension", dryRun);
}

async function installSuperpowersSkillMirror(home: string, agentId: "codex" | "pi", dryRun: boolean): Promise<void> {
  const agent = AGENTS.find((a) => a.id === agentId)!;
  if (!(await isDir(agent.rootDir(home)))) {
    console.log(`     · skip Superpowers ${agent.label} skill mirror (not detected)`);
    return;
  }
  const repo = await clonePackage(SUPERPOWERS_REPO, `${fulcrumHome(home)}/cache/superpowers`, dryRun);
  if (!repo) return;
  const src = `${repo}/skills`;
  if (!(await isDir(src))) {
    if (dryRun) {
      await previewSuperpowersSkillMirror(home, agentId);
      console.log("     [dry-run] Superpowers skills mirror plan unavailable until source cache exists");
    } else {
      console.log("     · Superpowers skills source unavailable");
    }
    return;
  }
  const dst = `${agent.skillsDir(home)}/superpowers`;
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillDir = `${src}/${entry.name}`;
    if (!(await exists(`${skillDir}/SKILL.md`))) continue;
    await copyTree(skillDir, `${dst}/${entry.name}`, dryRun);
  }
  await installPackagePayloadMirror(home, "superpowers", SUPERPOWERS_REPO, repo, agentId, dryRun);
  await writeMarker(home, superpowersMirrorMarker(agentId), dryRun);
  console.log(`     ✓ ${agent.label} Superpowers full skill mirror installed`);
}

async function previewSuperpowersSkillMirror(home: string, agentId: "codex" | "pi"): Promise<void> {
  const agent = AGENTS.find((a) => a.id === agentId)!;
  if (!(await isDir(agent.rootDir(home)))) return;
  console.log(`     [dry-run] would mkdir: ${agent.skillsDir(home)}/superpowers`);
}

function superpowersMirrorMarker(agentId: "codex" | "pi"): string {
  return agentId === "codex" ? SUPERPOWERS_CODEX_MIRROR_MARKER : SUPERPOWERS_PI_MIRROR_MARKER;
}

async function removeSuperpowersSkillMirror(home: string, agentId: "codex" | "pi", dryRun: boolean): Promise<void> {
  const agent = AGENTS.find((a) => a.id === agentId)!;
  const label = `${agent.label} Superpowers skill mirror`;
  const marker = superpowersMirrorMarker(agentId);
  const target = `${agent.skillsDir(home)}/superpowers`;
  const packageTarget = packageMirrorRoot(home, "superpowers", agentId);
  if (dryRun) {
    await removePath(target, label, true);
    await removePath(packageTarget, `${agent.label} Superpowers package mirror`, true);
    if (agentId === "codex") {
      await removePath(`${home}/.codex/plugins/cache/superpowers`, `${agent.label} Superpowers package cache root`, true);
    }
    await removeMarker(home, marker, label, true);
    return;
  }
  if (!(await hasMarker(home, marker))) {
    console.log(`     · skip ${label} removal (Fulcrum marker not present)`);
    return;
  }
  await removePath(target, label, false);
  await removePath(packageTarget, `${agent.label} Superpowers package mirror`, false);
  if (agentId === "codex") {
    await removePath(`${home}/.codex/plugins/cache/superpowers`, `${agent.label} Superpowers package cache root`, false);
  }
  await removeMarker(home, marker, label, false);
}

async function installPiSuperpowersPackage(home: string, dryRun: boolean): Promise<void> {
  const agent = AGENTS.find((a) => a.id === "pi")!;
  if (!(await isDir(agent.rootDir(home)))) {
    console.log("     · skip Superpowers Pi packages (Pi not detected)");
    return;
  }
  if (dryRun) {
    for (const pkg of SUPERPOWERS_PI_PACKAGES) {
      await runBestEffort(["pi", "install", pkg], `Superpowers Pi package install ${pkg}`, true);
    }
    await writeMarker(home, SUPERPOWERS_PI_MARKER, true);
    return;
  }
  if (!(await which("pi"))) {
    console.log("     · pi not on PATH: using Superpowers Pi skill mirror fallback");
    await installSuperpowersSkillMirror(home, "pi", dryRun);
    return;
  }
  let allOk = true;
  for (const pkg of SUPERPOWERS_PI_PACKAGES) {
    allOk = (await runBestEffort(["pi", "install", pkg], `Superpowers Pi package install ${pkg}`, false)) && allOk;
  }
  if (allOk) await writeMarker(home, SUPERPOWERS_PI_MARKER, false);
}

async function uninstallPiSuperpowersPackage(home: string, dryRun: boolean): Promise<void> {
  const settings = await readJsonObject(`${home}/.pi/agent/settings.json`);
  const installed = Array.isArray(settings["packages"]) ? settings["packages"] : [];
  if (dryRun) {
    for (const pkg of SUPERPOWERS_PI_PACKAGES) {
      await runBestEffort(["pi", "remove", pkg], `Superpowers Pi package remove ${pkg}`, true);
    }
    await removeMarker(home, SUPERPOWERS_PI_MARKER, "Superpowers Pi packages", true);
  } else if (!(await hasMarker(home, SUPERPOWERS_PI_MARKER))) {
    console.log("     · skip Superpowers Pi package removal (Fulcrum marker not present)");
  } else if (await which("pi")) {
    for (const pkg of SUPERPOWERS_PI_PACKAGES) {
      if (!installed.includes(pkg)) {
        console.log(`     · Superpowers Pi package ${pkg} not present`);
        continue;
      }
      await runBestEffort(["pi", "remove", pkg], `Superpowers Pi package remove ${pkg}`, dryRun);
    }
    await removeMarker(home, SUPERPOWERS_PI_MARKER, "Superpowers Pi packages", false);
  } else {
    console.log("     · Superpowers Pi packages: pi not on PATH");
  }
  await removeSuperpowersSkillMirror(home, "pi", dryRun);
}

export async function installCloudflarePackage(opts: PackageAgentOptions = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = homeDir();
  if (selectedAgent(opts.agents, "claude-code")) {
    await installClaudePlugin(home, "Cloudflare", CLOUDFLARE_PLUGIN, dryRun, CLOUDFLARE_CLAUDE_MARKER, CLOUDFLARE_MARKETPLACE);
  }
  const mirrorAgents = selectedMirrorAgents(opts.agents, ["codex", "gemini", "opencode", "pi"]);
  const installed = await installPackagePayloadMirrors(
    home,
    "cloudflare",
    CLOUDFLARE_REPO,
    `${fulcrumHome(home)}/cache/cloudflare-skills`,
    mirrorAgents,
    dryRun,
  );
  if (installed) await writeMarker(home, CLOUDFLARE_MIRROR_MARKER, dryRun);
}

export async function uninstallCloudflarePackage(opts: PackageAgentOptions = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = homeDir();
  if (selectedAgent(opts.agents, "claude-code")) {
    await uninstallClaudePlugin(home, "Cloudflare", CLOUDFLARE_PLUGIN, dryRun, CLOUDFLARE_CLAUDE_MARKER);
  }
  await removePackagePayloadMirrors(
    home,
    "cloudflare",
    CLOUDFLARE_MIRROR_MARKER,
    selectedMirrorAgents(opts.agents, ["codex", "gemini", "opencode", "pi"]),
    dryRun,
    `${fulcrumHome(home)}/cache/cloudflare-skills`,
  );
}

export async function installSuperpowersPackage(opts: PackageAgentOptions = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = homeDir();
  if (selectedAgent(opts.agents, "claude-code")) {
    await installClaudePlugin(home, "Superpowers", SUPERPOWERS_CLAUDE_PLUGIN, dryRun, SUPERPOWERS_CLAUDE_MARKER);
  }
  if (selectedAgent(opts.agents, "gemini")) await installGeminiSuperpowers(home, dryRun);
  if (selectedAgent(opts.agents, "opencode")) await addOpenCodePlugin(home, dryRun);
  if (selectedAgent(opts.agents, "codex")) await installSuperpowersSkillMirror(home, "codex", dryRun);
  if (selectedAgent(opts.agents, "pi")) await installPiSuperpowersPackage(home, dryRun);
}

export async function uninstallSuperpowersPackage(opts: PackageAgentOptions = {}): Promise<void> {
  const dryRun = opts.dryRun ?? false;
  const home = homeDir();
  if (selectedAgent(opts.agents, "claude-code")) {
    await uninstallClaudePlugin(home, "Superpowers", SUPERPOWERS_CLAUDE_PLUGIN, dryRun, SUPERPOWERS_CLAUDE_MARKER);
  }
  if (selectedAgent(opts.agents, "gemini")) await uninstallGeminiSuperpowers(home, dryRun);
  if (selectedAgent(opts.agents, "opencode")) await removeOpenCodePlugin(home, dryRun);
  if (selectedAgent(opts.agents, "codex")) await removeSuperpowersSkillMirror(home, "codex", dryRun);
  if (selectedAgent(opts.agents, "pi")) await uninstallPiSuperpowersPackage(home, dryRun);
}

export async function installVendorCapabilityPackages(opts: PackageAgentOptions = {}): Promise<void> {
  await installCloudflarePackage(opts);
  await installSuperpowersPackage(opts);
}

export async function uninstallVendorCapabilityPackages(opts: PackageAgentOptions = {}): Promise<void> {
  await uninstallCloudflarePackage(opts);
  await uninstallSuperpowersPackage(opts);
}
