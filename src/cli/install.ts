// fulcrum install — splice rules/AGENTS.md into each agent's primary rules
// file via <!-- BEGIN/END FULCRUM RULES --> sentinel markers, vendor recipe
// pool, seed tool-output-policy.toml, and install caveman per detected agent.
//
// Idempotent. Non-destructive: user content outside the markers is preserved.
//
// HARD RULE: never write to ~/.agents/ — shared path pollutes every agent's
// context. Each agent has its own skills folder; install ONLY there.
//
// Flags:
//   --dry-run          Preview what would be written/run without making any
//                      changes. Reads (stat, readFile, readdir) execute
//                      normally so detection still works; every write/exec is
//                      replaced by a  [dry-run] would …  log line.
//   --with-project <dir>  Also run `fulcrum init <dir>` after install.
//   --profile <minimal|rules-only|full>
//                      Select install surface. Default minimal avoids global
//                      skill/package mutation; full is the historical bootstrap.
//   --no-skills       Do not run authored/upstream skill sync during install.
//   --no-upstream-skills
//                      Do not install curated third-party skill packs.
//   --no-default-mcps Register MCP definitions/config, but skip the recommended
//                      default enable step and leave existing MCP state intact.
//   --enable-all-mcps Enable every builtin MCP after registration.

import { mkdir, readFile, writeFile, copyFile, readdir, stat, appendFile, mkdtemp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { which, run as runProc } from "../utils/proc.ts";
import { pruneSourceBackupFiles } from "../utils/source-clean.ts";
import { AGENTS } from "../agents/registry.ts";
import { patchJsonOwnedKey, patchTomlOwnedKey } from "../utils/config-patcher.ts";
import { FULCRUM_RULES_BEGIN as BEGIN, FULCRUM_RULES_END as END, replaceSentinelBlock } from "./vendor-rules.ts";

// ---------------------------------------------------------------------------
// Dry-run mode
// ---------------------------------------------------------------------------

/** Set to true when --dry-run is passed; no writes or subprocesses will fire. */
let DRY_RUN = false;

/** Toggle dry-run mode (used by tests). */
export function setDryRun(v: boolean): void { DRY_RUN = v; }

/** writeFile wrapper — skips in dry-run. */
async function wf(path: string, data: string): Promise<void> {
  if (DRY_RUN) { console.log(`     [dry-run] would write: ${path}`); return; }
  await writeFile(path, data);
}

/** mkdir({ recursive: true }) wrapper — skips in dry-run. */
async function mk(path: string): Promise<void> {
  if (DRY_RUN) { console.log(`     [dry-run] would mkdir: ${path}`); return; }
  await mkdir(path, { recursive: true });
}

/** copyFile wrapper — skips in dry-run. */
async function cp(src: string, dst: string): Promise<void> {
  if (DRY_RUN) { console.log(`     [dry-run] would copy: ${src} → ${dst}`); return; }
  await copyFile(src, dst);
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

function isMirrorExcludedName(name: string): boolean {
  return (
    name.endsWith(".original.md") ||
    name.endsWith(".backup.md") ||
    name === "_archive" ||
    name === "_template" ||
    name === ".claude" ||
    name === ".git" ||
    name === ".github" ||
    name === "node_modules" ||
    name === "tests" ||
    name === "evals" ||
    name === "benchmarks" ||
    name === "coverage" ||
    name === "__pycache__" ||
    name === ".venv" ||
    name === "worktrees"
  );
}

async function copyTree(src: string, dst: string): Promise<void> {
  const s = await stat(src);
  if (!s.isDirectory()) {
    await mk(dirname(dst));
    await cp(src, dst);
    return;
  }
  await mk(dst);
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (isMirrorExcludedName(entry.name)) continue;
    await copyTree(`${src}/${entry.name}`, `${dst}/${entry.name}`);
  }
}

function upsertTomlSection(existing: string, header: string, body: string): string {
  const section = `${header}\n${body.trimEnd()}\n`;
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\n)${escaped}\\n[\\s\\S]*?(?=\\n\\[|$)`);
  if (re.test(existing)) return existing.replace(re, `\n${section}`).trimStart();
  return `${existing.trimEnd()}\n\n${section}`.trimStart();
}

function ensureCodexHooksFeature(existing: string): string {
  if (/^fulcrum_owned_keys\s*=/m.test(existing)) {
    return patchTomlOwnedKey(existing, "features.codex_hooks", true, "fulcrum_owned_keys");
  }
  if (/^codex_hooks\s*=\s*true$/m.test(existing)) return existing;
  if (/^\[features\]$/m.test(existing)) {
    return existing.replace(/^\[features\]$/m, "[features]\ncodex_hooks = true").replace(
      /^(?![\s\S]*^fulcrum_owned_keys\s*=)/,
      'fulcrum_owned_keys = ["features.codex_hooks"]\n\n',
    );
  }
  return `${existing.trimEnd()}\n\nfulcrum_owned_keys = ["features.codex_hooks"]\n\n[features]\ncodex_hooks = true\n`.trimStart();
}

async function mergeCodexCavemanHooks(home: string, repoRootDir: string): Promise<void> {
  const target = `${home}/.codex/hooks.json`;
  const source = `${repoRootDir}/.codex/hooks.json`;
  if (!(await exists(source))) return;

  let targetJson: Record<string, unknown> = {};
  if (await exists(target)) {
    try {
      targetJson = JSON.parse(await readFile(target, "utf8"));
    } catch {
      targetJson = {};
    }
  }

  const sourceJson = JSON.parse(await readFile(source, "utf8"));
  const targetHooks = (targetJson.hooks && typeof targetJson.hooks === "object")
    ? targetJson.hooks as Record<string, unknown[]>
    : {};
  const sourceHooks = (sourceJson.hooks && typeof sourceJson.hooks === "object")
    ? sourceJson.hooks as Record<string, unknown[]>
    : {};

  for (const [event, entries] of Object.entries(sourceHooks)) {
    const current = Array.isArray(targetHooks[event]) ? targetHooks[event] : [];
    const seen = new Set(current.map((entry) => JSON.stringify(entry)));
    for (const entry of Array.isArray(entries) ? entries : []) {
      const key = JSON.stringify(entry);
      if (!seen.has(key)) {
        current.push(entry);
        seen.add(key);
      }
    }
    targetHooks[event] = current;
  }

  targetJson.hooks = targetHooks;
  await mk(dirname(target));
  await wf(target, prettyJson(targetJson));
}

async function configureCodexCavemanPlugin(home: string, repoRootDir: string): Promise<void> {
  const pluginJsonPath = `${repoRootDir}/plugins/caveman/.codex-plugin/plugin.json`;
  if (!(await exists(pluginJsonPath))) return;
  const pluginJson = JSON.parse(await readFile(pluginJsonPath, "utf8"));
  const version = typeof pluginJson.version === "string" ? pluginJson.version : "0.1.0";
  const pluginCache = `${home}/.codex/plugins/cache/caveman/caveman/${version}`;
  assertNotAgentsPath(pluginCache, home);
  await copyTree(`${repoRootDir}/plugins/caveman`, pluginCache);
  await installCavemanPackagePayload(home, "codex", repoRootDir, `${pluginCache}/package`);

  const configPath = `${home}/.codex/config.toml`;
  let config = (await exists(configPath)) ? await readFile(configPath, "utf8") : "";
  config = ensureCodexHooksFeature(config);
  config = upsertTomlSection(config, "[marketplaces.caveman]", [
    `source_type = "git"`,
    `source = "${CAVEMAN_REPO}"`,
  ].join("\n"));
  config = upsertTomlSection(config, "[plugins.\"caveman@caveman\"]", "enabled = true");
  await mk(dirname(configPath));
  await wf(configPath, `${config.trimEnd()}\n`);

  await mergeCodexCavemanHooks(home, repoRootDir);
}

type CavemanFallbackAgent = "codex" | "opencode" | "pi";

function cavemanPackageRoot(home: string, agentId: CavemanFallbackAgent): string {
  if (agentId === "opencode") return `${home}/.config/opencode/packages/caveman`;
  if (agentId === "pi") return `${home}/.pi/agent/packages/caveman`;
  return `${home}/.codex/plugins/cache/caveman`;
}

function cavemanSourceCacheRoot(home: string): string {
  return `${process.env["FULCRUM_HOME"] ?? `${home}/.fulcrum`}/cache/caveman`;
}

function unsupportedCavemanSurfaces(agentId: CavemanFallbackAgent): Array<{ surface: string; reason: string }> {
  if (agentId === "codex") return [];
  return [
    { surface: "codex-plugin", reason: "Agent has no Codex plugin loader; source metadata is copied in package payload only." },
    { surface: "codex-hooks", reason: "Agent does not read .codex/hooks.json; hook source is copied but not registered." },
    { surface: "codex-config", reason: "Agent does not read .codex/config.toml; config source is copied but not merged." },
    { surface: "claude-plugin", reason: "Agent has no Claude Code plugin installer; official Claude install path is preserved separately." },
    { surface: "gemini-extension", reason: "Agent has no Gemini extension installer; official Gemini install path is preserved separately." },
  ];
}

async function installCavemanPackagePayload(
  home: string,
  agentId: CavemanFallbackAgent,
  sourceRoot: string,
  targetRoot = cavemanPackageRoot(home, agentId),
): Promise<void> {
  assertNotAgentsPath(targetRoot, home);
  if (!DRY_RUN) await rm(targetRoot, { recursive: true, force: true });
  await copyTree(sourceRoot, targetRoot);
  const unsupported = unsupportedCavemanSurfaces(agentId);
  if (unsupported.length > 0) {
    await wf(`${targetRoot}/.fulcrum-unsupported.json`, prettyJson({
      package: "caveman",
      agent: agentId,
      unsupported,
    }));
  }
}

function cavemanMirrorsMarkerPath(home: string): string {
  return `${process.env["FULCRUM_HOME"] ?? `${home}/.fulcrum`}/state/global/caveman-mirrors.installed`;
}

async function writeCavemanMirrorsMarker(home: string): Promise<void> {
  const path = cavemanMirrorsMarkerPath(home);
  if (DRY_RUN) {
    console.log(`     [dry-run] would write marker: ${path}`);
    return;
  }
  await mk(dirname(path));
  await wf(path, new Date().toISOString() + "\n");
}

async function installCavemanFromRepo(
  home: string,
  skillsRoot: string,
  label: string,
  agentId: CavemanFallbackAgent,
  includeCodexPlugin = false,
): Promise<boolean> {
  const gitPath = await which("git");
  if (!gitPath) {
    console.log(`     · ${label}: git not on PATH — manual: clone ${CAVEMAN_REPO} and copy skills/* to ${skillsRoot}`);
    return false;
  }

  const tmp = DRY_RUN
    ? `${tmpdir()}/fulcrum-caveman-dry-run`
    : cavemanSourceCacheRoot(home);
  if (DRY_RUN || !(await isDir(`${tmp}/skills`))) {
    if (!DRY_RUN) await mk(dirname(tmp));
    const clone = await runProcDry(["git", "clone", "--depth", "1", CAVEMAN_REPO, tmp]);
    if (clone.exit !== 0) {
      console.log(`     ✗ ${label} caveman git clone failed: ${clone.stderr.trim()} — manual: clone ${CAVEMAN_REPO} and copy skills/* to ${skillsRoot}`);
      return false;
    }
  }
  if (DRY_RUN) {
    console.log(`     [dry-run] would copy: ${tmp}/skills/* → ${skillsRoot}`);
    if (includeCodexPlugin) {
      console.log(`     [dry-run] would copy: ${tmp}/plugins/caveman → ${home}/.codex/plugins/cache/caveman/caveman/0.1.0`);
    }
    console.log(`     [dry-run] would mirror Caveman package payload for ${label}`);
    await writeCavemanMirrorsMarker(home);
    return true;
  }

  const repoSkills = `${tmp}/skills`;
  if (!(await isDir(repoSkills))) {
    console.log(`     ✗ ${label} caveman repo missing skills/ directory`);
    return false;
  }
  await mk(skillsRoot);
  for (const entry of await readdir(repoSkills, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const target = `${skillsRoot}/${entry.name}`;
      assertNotAgentsPath(target, home);
      await copyTree(`${repoSkills}/${entry.name}`, target);
    }
  }
  if (includeCodexPlugin) {
    await configureCodexCavemanPlugin(home, tmp);
  } else {
    await installCavemanPackagePayload(home, agentId, tmp);
  }
  await writeCavemanMirrorsMarker(home);
  return true;
}

/** appendFile wrapper — skips in dry-run. */
async function ap(path: string, data: string): Promise<void> {
  if (DRY_RUN) { console.log(`     [dry-run] would append: ${path}`); return; }
  await appendFile(path, data);
}

/** runProc wrapper — skips in dry-run. */
async function runProcDry(cmd: string[]): Promise<{ exit: number; stdout: string; stderr: string }> {
  if (DRY_RUN) {
    console.log(`     [dry-run] would run: ${cmd.join(" ")}`);
    return { exit: 0, stdout: "", stderr: "" };
  }
  return runProc(cmd, { timeoutMs: 60_000 });
}


function repoRoot(): string {
  return process.env["FULCRUM_REPO_DIR"] ?? process.cwd();
}

function fulcrumHome(): string {
  return process.env["FULCRUM_HOME"] ?? `${process.env["HOME"]}/.fulcrum`;
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function isDir(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

async function isClaudePluginInstalled(home: string, pluginName: string): Promise<boolean> {
  const installedFile = `${home}/.claude/plugins/installed_plugins.json`;
  try {
    const parsed = JSON.parse(await readFile(installedFile, "utf8"));
    const plugins = parsed?.plugins;
    return !!plugins && typeof plugins === "object" && pluginName in plugins;
  } catch {
    return false;
  }
}

export async function spliceSentinel(target: string, body: string, label: string): Promise<void> {
  await mk(dirname(target));
  let existing = "";
  if (await exists(target)) {
    existing = await readFile(target, "utf8");
  }

  if (existing.includes(BEGIN)) {
    const nb = (existing.match(new RegExp(BEGIN, "g")) ?? []).length;
    const ne = (existing.match(new RegExp(END, "g"))   ?? []).length;
    if (nb !== 1 || ne !== 1) {
      console.error(`     ✗ ${label}  refused: ${target} has ${nb} BEGIN / ${ne} END markers (expected 1/1). Fix manually.`);
      return;
    }
    const out = replaceSentinelBlock(existing, body);
    await wf(target, out);
    console.log(`     ↻ ${label}  (block replaced) → ${target}`);
  } else {
    const sep = existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "";
    await wf(target, `${existing}${sep}${BEGIN}\n${body}\n${END}\n`);
    console.log(`     + ${label}  (block appended) → ${target}`);
  }
}

function rulesTargets(home: string): Array<{ path: string; label: string; alwaysCreate?: boolean }> {
  // Gemini's rulesFile (~/AGENTS.md) must always be created even if ~/.gemini
  // doesn't exist yet — that's the @AGENTS.md import source for GEMINI.md.
  return [
    ...AGENTS
      .filter((a) => a.id !== "gemini")
      .map((a) => ({ path: a.rulesFile(home), label: a.label })),
    {
      path: AGENTS.find((a) => a.id === "gemini")!.rulesFile(home),
      label: "Gemini source (referenced via @AGENTS.md)",
      alwaysCreate: true,
    },
  ];
}

async function vendorHookSnippets(): Promise<void> {
  const root = repoRoot();
  const src = `${root}/hooks/recipes`;
  const dst = `${fulcrumHome()}/hooks/snippets`;
  if (!(await isDir(src))) {
    console.log(`     · no hook recipes in ${src} (skip)`);
    return;
  }
  await mk(dst);
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (entry.name.endsWith(".snippet.md")) {
      await cp(`${src}/${entry.name}`, `${dst}/${entry.name}`);
    }
  }
  if (!DRY_RUN) {
    const installed = (await readdir(dst)).filter((f) => f.endsWith(".snippet.md"));
    console.log(`     vendored ${installed.length} snippet(s)`);
  }
}

async function seedPolicy(): Promise<void> {
  const root = repoRoot();
  const src = `${root}/config/tool-output-policy.toml`;
  const dst = `${fulcrumHome()}/tool-output-policy.toml`;
  if (await exists(dst)) {
    console.log(`     existing policy left intact: ${dst}`);
    return;
  }
  if (!(await exists(src))) {
    console.log(`     · no default policy at ${src} (skip)`);
    return;
  }
  await mk(fulcrumHome());
  await cp(src, dst);
  console.log(`     installed default policy: ${dst}`);
}

export async function installToolOutputPolicy(dryRun = false): Promise<void> {
  const previousDryRun = DRY_RUN;
  DRY_RUN = dryRun;
  try {
    await seedPolicy();
  } finally {
    DRY_RUN = previousDryRun;
  }
}

const CAVEMAN_REPO = "https://github.com/JuliusBrussee/caveman";

// ---------------------------------------------------------------------------
// Known vendor rule headings whose duplicate blocks we own and strip.
// Add new vendors here when their rule text is mirrored into rules/AGENTS.md.
// ---------------------------------------------------------------------------
const VENDOR_RULE_HEADINGS: ReadonlyArray<string> = [
  "# graphify",
];

/**
 * Strip vendor-installed rule blocks that live OUTSIDE the FULCRUM sentinel.
 *
 * Vendor installers (e.g. `graphify install`) write a rule block directly into
 * the agent's primary rules file. The same rule text lives in rules/AGENTS.md
 * and is spliced into the FULCRUM sentinel block by `fulcrum install`. The
 * duplicate outside the sentinel wastes context and can conflict.
 *
 * Rules:
 * - Only strips blocks whose first line exactly matches a heading in
 *   VENDOR_RULE_HEADINGS (conservative: prevents stripping user content).
 * - Never touches content inside the FULCRUM sentinel block.
 * - Idempotent: re-running when no duplicate exists is a no-op.
 * - dryRun=true logs what would be removed without writing.
 *
 * @param filePath  Absolute path to the agent's primary rules file.
 * @param dryRun    When true, log but do not write.
 */
export async function stripVendorRuleBlocks(filePath: string, dryRun: boolean): Promise<void> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    return; // file doesn't exist — nothing to do
  }

  // Split content into "inside sentinel" and "outside sentinel" regions.
  // We only operate on the outside regions.
  const hasSentinel = content.includes(BEGIN) && content.includes(END);

  let beforeSentinel: string;
  let sentinel: string;
  let afterSentinel: string;

  if (hasSentinel) {
    const bIdx = content.indexOf(BEGIN);
    const eIdx = content.indexOf(END) + END.length;
    beforeSentinel = content.slice(0, bIdx);
    sentinel = content.slice(bIdx, eIdx);
    afterSentinel = content.slice(eIdx);
  } else {
    beforeSentinel = content;
    sentinel = "";
    afterSentinel = "";
  }

  /**
   * Strip all known vendor blocks from a text region.
   * A block is: the heading line + all following lines until the next
   * top-level `^# ` heading or a blank line followed by non-continuation
   * content (two consecutive blank lines = end of block).
   */
  function stripVendorBlocks(region: string): string {
    for (const heading of VENDOR_RULE_HEADINGS) {
      // Match: heading line + the lines that follow it until next ^# heading
      // or double-blank-line gap (conservative block boundary).
      // Uses a regex: heading must be at line start, followed by lines until
      // the next top-level heading or end-of-string.
      const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(
        // optional leading newline, then the heading, then all lines until
        // next top-level heading or EOS
        `\\n?${escaped}\\n(?:(?!^# )[^\\n]*\\n)*`,
        "gm",
      );
      region = region.replace(pattern, "\n");
    }
    // Collapse triple+ blank lines left by removal.
    return region.replace(/\n{3,}/g, "\n\n");
  }

  const strippedBefore = stripVendorBlocks(beforeSentinel);
  const strippedAfter = stripVendorBlocks(afterSentinel);

  if (strippedBefore === beforeSentinel && strippedAfter === afterSentinel) {
    return; // nothing changed
  }

  const result = strippedBefore + sentinel + strippedAfter;
  // Normalize trailing newline.
  const out = result.trimEnd() + "\n";

  if (dryRun) {
    console.log(`     [dry-run] would strip vendor rule blocks from: ${filePath}`);
    return;
  }
  await wf(filePath, out);
  console.log(`     ✓ stripped vendor rule blocks from: ${filePath}`);
}

/**
 * Guard: throw if path is under $HOME/.agents/.
 * Prevents writing to the forbidden shared agent folder.
 */
export function assertNotAgentsPath(p: string, home: string): void {
  const normalized = resolve(p);
  const agentsDir = resolve(`${home}/.agents`);
  // block exact match and anything under it
  if (normalized === agentsDir || normalized.startsWith(agentsDir + "/")) {
    throw new Error(
      `HARD RULE VIOLATION: refusing to write under ~/.agents/ (${p}). ` +
      `Use the per-agent skills folder instead. See HANDOVER.md §6.1.`
    );
  }
}

async function geminiShim(home = process.env["HOME"] ?? ""): Promise<void> {
  const gemDir = `${home}/.gemini`;
  if (!(await isDir(gemDir))) return;
  const file = `${gemDir}/GEMINI.md`;
  let body = "";
  if (await exists(file)) body = await readFile(file, "utf8");
  if (!/@AGENTS\.md/.test(body)) {
    await ap(file, (body && !body.endsWith("\n") ? "\n" : "") + "@AGENTS.md\n");
    console.log("     ✓ Gemini GEMINI.md updated with @AGENTS.md import");
  }
}

export async function installRulesBlocks(home: string, dryRun = false): Promise<void> {
  const previousDryRun = DRY_RUN;
  DRY_RUN = dryRun;
  try {
    const root = repoRoot();
    const rulesPath = `${root}/rules/AGENTS.md`;
    if (!(await exists(rulesPath))) {
      throw new Error(`fulcrum install: cannot find ${rulesPath}`);
    }
    const body = (await readFile(rulesPath, "utf8")).trimEnd();
    for (const t of rulesTargets(home)) {
      const parent = dirname(t.path);
      if (!t.alwaysCreate && !(await isDir(parent)) && !(await exists(t.path))) {
        console.log(`     · skip ${t.label} (parent dir not present)`);
        continue;
      }
      await spliceSentinel(t.path, body, t.label);
    }
    await geminiShim(home);
  } finally {
    DRY_RUN = previousDryRun;
  }
}

/**
 * Install caveman into all detected agents.
 * Fail-soft per agent: log and continue on any error.
 *
 * HARD RULE: never write to ~/.agents/ — enforced via assertNotAgentsPath.
 */
export async function installCaveman(home: string, opts: { dryRun?: boolean } = {}): Promise<void> {
  const previousDryRun = DRY_RUN;
  DRY_RUN = opts.dryRun ?? DRY_RUN;
  try {
    // --- Claude Code ---
    const claudeDir = `${home}/.claude`;
    if (await isDir(claudeDir)) {
      const compressDir = `${claudeDir}/plugins/cache/caveman/caveman`;
      const { shouldInstallClaudePlugin, writeMarker } = await import("./claude-plugin-markers.ts");
      if ((await isClaudePluginInstalled(home, "caveman@caveman")) && (await isDir(compressDir))) {
        console.log("     · skip Claude Code caveman (already installed)");
      } else if (!(await which("claude"))) {
        console.log("     · skip Claude Code (claude not on PATH)  — manual: claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman@caveman");
      } else if (!(await shouldInstallClaudePlugin("caveman@caveman"))) {
        console.log("     · skip Claude Code caveman: pass --allow-claude-cli to opt in, or run manually: claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman@caveman");
      } else {
        const r1 = await runProcDry(["claude", "plugin", "marketplace", "add", "JuliusBrussee/caveman"]);
        if (r1.exit !== 0) {
          console.log(`     ✗ Claude Code caveman marketplace add failed: ${r1.stderr.trim()} — manual: claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman@caveman`);
        } else {
          if (!DRY_RUN) {
            await writeMarker({ plugin: "caveman@caveman", marketplace: "JuliusBrussee/caveman", source: "package.caveman", operation: "install" });
          }
          const r2 = await runProcDry(["claude", "plugin", "install", "caveman@caveman"]);
          if (r2.exit !== 0) {
            console.log(`     ✗ Claude Code caveman install failed: ${r2.stderr.trim()} — manual: claude plugin install caveman@caveman`);
          } else {
            console.log("     ✓ Claude Code caveman installed");
          }
        }
      }
    } else {
      console.log("     · skip Claude Code (not detected)");
    }

    // --- Gemini CLI ---
    const geminiDir = `${home}/.gemini`;
    if (await isDir(geminiDir)) {
      const geminiCavemanDir = `${geminiDir}/extensions/caveman`;
      if (await isDir(geminiCavemanDir)) {
        console.log("     · skip Gemini CLI caveman (already installed)");
      } else if (!(await which("gemini"))) {
        console.log("     · skip Gemini CLI (gemini not on PATH)  — manual: gemini extensions install https://github.com/JuliusBrussee/caveman --consent --skip-settings");
      } else {
        const r = await runProcDry(["gemini", "extensions", "install", CAVEMAN_REPO, "--consent", "--skip-settings"]);
        if (r.exit !== 0) {
          console.log(`     ✗ Gemini CLI caveman install failed: ${r.stderr.trim()} — manual: gemini extensions install ${CAVEMAN_REPO} --consent --skip-settings`);
        } else {
          console.log("     ✓ Gemini CLI caveman installed");
        }
      }
    } else {
      console.log("     · skip Gemini CLI (not detected)");
    }

    // --- W1.3: Codex, OpenCode, Pi — direct vendor repo copy.
    // Fulcrum copies Caveman surfaces into native per-agent roots. Codex gets
    // plugin metadata/assets/hooks as well as skills because Caveman ships more
    // than a bare SKILL.md.
    const npxAgentDefs: Array<{ id: CavemanFallbackAgent; dir: string; label: string; skillsRoot: string; includeCodexPlugin?: boolean }> = [
      { id: "codex",    dir: `${home}/.codex`,          label: "Codex CLI", skillsRoot: `${home}/.codex/skills`, includeCodexPlugin: true },
      { id: "opencode", dir: `${home}/.config/opencode`, label: "OpenCode",  skillsRoot: `${home}/.config/opencode/skills` },
      { id: "pi",       dir: `${home}/.pi/agent`,        label: "Pi CLI",    skillsRoot: `${home}/.pi/agent/skills` },
    ];

    for (const ag of npxAgentDefs) {
      if (!(await isDir(ag.dir))) {
        console.log(`     · skip ${ag.label} (not detected)`);
        continue;
      }

      // Idempotency: if the required surfaces already exist, skip.
      const cavemanSkillDir = `${ag.skillsRoot}/caveman`;
      const codexPluginDir = `${home}/.codex/plugins/cache/caveman/caveman/0.1.0`;
      const packageDir = ag.includeCodexPlugin ? `${codexPluginDir}/package` : cavemanPackageRoot(home, ag.id);
      if (
        (await isDir(cavemanSkillDir)) &&
        (!ag.includeCodexPlugin || (await isDir(codexPluginDir))) &&
        (await isDir(packageDir)) &&
        (await isDir(cavemanSourceCacheRoot(home)))
      ) {
        console.log(`     · skip ${ag.label} caveman (already installed)`);
        continue;
      }

      if (await installCavemanFromRepo(home, ag.skillsRoot, ag.label, ag.id, !!ag.includeCodexPlugin)) {
        console.log(`     ✓ ${ag.label} caveman installed from official repo`);
      } else {
        console.log(`     ✗ ${ag.label} caveman install failed — expected ${cavemanSkillDir}`);
      }
    }

    // Lock caveman default mode to "ultra" across every agent that reads the
    // shared caveman config (Claude Code, Codex, OpenCode all resolve via
    // caveman-config.js → $XDG_CONFIG_HOME/caveman/config.json or
    // ~/.config/caveman/config.json). Idempotent: existing file with
    // `defaultMode: "ultra"` is left intact; any other value is overwritten so
    // the always-on contract holds. User can opt out by setting
    // `CAVEMAN_DEFAULT_MODE=full` in their shell env (env wins per resolver).
    await lockCavemanUltra(home);
    await pruneCavemanSourceBackups(home);
  } finally {
    DRY_RUN = previousDryRun;
  }
}

async function pruneCavemanSourceBackups(home: string): Promise<void> {
  await pruneSourceBackupFiles(`${home}/.claude/plugins/cache/caveman`, {
    dryRun: DRY_RUN,
    label: "Claude Code caveman plugin cache",
    log: true,
  });
  await pruneSourceBackupFiles(`${home}/.claude/plugins/marketplaces/caveman`, {
    dryRun: DRY_RUN,
    label: "Claude Code caveman marketplace cache",
    log: true,
  });
  await pruneSourceBackupFiles(`${home}/.gemini/extensions/caveman`, {
    dryRun: DRY_RUN,
    label: "Gemini caveman extension",
    log: true,
  });
}

export async function lockCavemanUltra(home: string): Promise<void> {
  const cfgDir = process.env["XDG_CONFIG_HOME"]
    ? `${process.env["XDG_CONFIG_HOME"]}/caveman`
    : `${home}/.config/caveman`;
  const cfgPath = `${cfgDir}/config.json`;
  if (await exists(cfgPath)) {
    try {
      const existing = JSON.parse(await readFile(cfgPath, "utf8"));
      if (existing && existing.defaultMode === "ultra") {
        console.log(`     · caveman defaultMode already 'ultra' (${cfgPath})`);
        return;
      }
      const source = await readFile(cfgPath, "utf8");
      if (Array.isArray(existing?.__fulcrum_owned_keys)) {
        await wf(cfgPath, patchJsonOwnedKey(source, ["defaultMode"], "ultra", "__fulcrum_owned_keys"));
        console.log(`     ✓ caveman defaultMode set to 'ultra' (${cfgPath})`);
        return;
      }
    } catch {
      // malformed JSON — overwrite below
    }
  }
  await mk(cfgDir);
  await wf(cfgPath, prettyJson({ defaultMode: "ultra" }));
  console.log(`     ✓ caveman defaultMode set to 'ultra' (${cfgPath})`);
}

type McpDefaultMode = "minimal" | "none" | "all";
type InstallProfile = "minimal" | "rules-only" | "full";

/**
 * Register all builtin MCPs in the registry. Registration is always config-only;
 * default state is applied separately by applyBuiltinMcpDefaultState().
 */
export async function installMcpRegistryEntries(home: string): Promise<void> {
  const { registerServer, applyToAgents } = await import("./mcp-registry.ts");
  const { BUILTIN_MCPS, MINIMAL_DEFAULT_MCPS } = await import("./mcp-builtins.ts");

  for (const { name, spec } of BUILTIN_MCPS) {
    const defaultState = spec.default_enabled || (MINIMAL_DEFAULT_MCPS as readonly string[]).includes(name)
      ? "recommended-default"
      : "opt-in";
    if (DRY_RUN) {
      console.log(`     [dry-run] would register ${name} MCP (${defaultState}; enable with: fulcrum mcp enable ${name})`);
      continue;
    }
    await registerServer(name, spec);
    console.log(`     ✓ ${name} MCP registered (${defaultState}; enable with: fulcrum mcp enable ${name})`);
    await applyToAgents(name);
  }

  // Dart hint: doctor also reports this, but surface it at install time too.
  if (!(await which("dart"))) {
    console.log("     · dart not on PATH — dart MCP requires Dart SDK ≥ 3.9.0-163.0.dev; see: https://github.com/dart-lang/ai/tree/main/pkgs/dart_mcp_server");
  }

  // Package mirrors are owned by package.* components. The MCP registry only
  // registers/applies MCP definitions so profile.minimal has no package side
  // effects.
}

export async function applyBuiltinMcpDefaultState(mode: McpDefaultMode): Promise<void> {
  const { setEnabled, applyToAgents, loadRegistry, saveRegistry, ALL_AGENT_IDS } = await import("./mcp-registry.ts");
  const { BUILTIN_MCPS, MINIMAL_DEFAULT_MCPS } = await import("./mcp-builtins.ts");

  const allNames = BUILTIN_MCPS.map(({ name }) => name);
  const minimalNames = [...MINIMAL_DEFAULT_MCPS];
  const targetNames = mode === "all" ? allNames : minimalNames;

  if (mode === "none") {
    console.log("     · default MCP enable step skipped; existing MCP state left untouched");
    return;
  }

  for (const name of targetNames) {
    if (DRY_RUN) {
      console.log(`     [dry-run] would enable ${name} on [${ALL_AGENT_IDS.join(", ")}]`);
      continue;
    }
    if (mode === "minimal") {
      const reg = await loadRegistry();
      const server = reg.servers[name];
      if (!server) throw new Error(`mcp-registry: server '${name}' not registered`);
      for (const agentId of ALL_AGENT_IDS) {
        if (!server.agent_visibility[agentId]) continue;
        server.enabled[agentId] = true;
      }
      await saveRegistry(reg);
    } else {
      await setEnabled(name, true, { agents: [...ALL_AGENT_IDS] });
    }
    await applyToAgents(name);
    if (mode === "minimal") {
      console.log(`     ✓ ${name} recommended default enabled`);
    } else {
      console.log(`     ✓ ${name} enabled on [${ALL_AGENT_IDS.join(", ")}]`);
    }
  }
}

export async function run(args: string[]): Promise<void> {
  let withProject: string | null = null;
  let syncAuthoredSkills = true;
  let syncUpstream = true;
  let mcpDefaultMode: McpDefaultMode = "minimal";
  let installProfile: InstallProfile = "minimal";
  DRY_RUN = false;
  let i = 0;
  while (i < args.length) {
    const a = args[i]!;
    if (a === "--dry-run") {
      DRY_RUN = true;
      i += 1;
    } else if (a === "--with-project") {
      withProject = args[i + 1] ?? process.cwd();
      i += 2;
    } else if (a === "--profile") {
      const value = args[i + 1];
      if (value !== "minimal" && value !== "rules-only" && value !== "full") {
        console.error("fulcrum install: --profile must be minimal, rules-only, or full");
        process.exit(2);
      }
      installProfile = value;
      i += 2;
    } else if (a === "--no-skills") {
      syncAuthoredSkills = false;
      syncUpstream = false;
      i += 1;
    } else if (a === "--no-upstream-skills") {
      syncUpstream = false;
      i += 1;
    } else if (a === "--no-default-mcps") {
      mcpDefaultMode = "none";
      i += 1;
    } else if (a === "--enable-all-mcps") {
      mcpDefaultMode = "all";
      i += 1;
    } else if (a === "--allow-claude-cli") {
      const { setClaudeCliAllowed } = await import("./claude-plugin-markers.ts");
      setClaudeCliAllowed(true);
      i += 1;
    } else {
      console.error(`fulcrum install: unknown arg '${a}'`);
      process.exit(2);
    }
  }

  if (args.includes("--no-default-mcps") && args.includes("--enable-all-mcps")) {
    console.error("fulcrum install: --no-default-mcps conflicts with --enable-all-mcps");
    process.exit(2);
  }

  if (DRY_RUN) {
    console.log("(dry-run mode — no files will be written)\n");
  }

  const root = repoRoot();
  console.log(`Fulcrum install — source: ${root}\n`);

  if (installProfile === "full") {
    console.log("1/4  Vendoring hook registration snippets → ~/.fulcrum/hooks/snippets/");
    await vendorHookSnippets();
  } else {
    console.log(`1/4  Skipping hook registration snippets (--profile ${installProfile})`);
  }
  console.log();

  const target =
    mcpDefaultMode === "all" ? "profile.verify-all" :
    installProfile === "full" ? "profile.default" :
    installProfile === "rules-only" ? "profile.rules-only" :
    "profile.minimal";
  const exclude: string[] = [];
  if (!syncAuthoredSkills) {
    exclude.push("skills.authored");
  }
  if (!syncUpstream) {
    exclude.push("skills.upstream");
  }
  if (installProfile !== "full") {
    syncAuthoredSkills = false;
    syncUpstream = false;
  }

  console.log(`2/4  Installing component profile ${target}`);
  const { planComponentOperation } = await import("../components/planner.ts");
  const { executeComponentPlan } = await import("../components/executor.ts");
  const plan = planComponentOperation({
    operation: "install",
    target,
    exclude,
  });
  const previousCodexSkillScope = process.env["FULCRUM_CODEX_SKILLS_SCOPE"];
  if (installProfile === "full") {
    process.env["FULCRUM_CODEX_SKILLS_SCOPE"] = "global";
  }
  try {
    await executeComponentPlan(plan, { dryRun: DRY_RUN });
  } finally {
    if (previousCodexSkillScope === undefined) delete process.env["FULCRUM_CODEX_SKILLS_SCOPE"];
    else process.env["FULCRUM_CODEX_SKILLS_SCOPE"] = previousCodexSkillScope;
  }
  console.log();

  const modeLabel = mcpDefaultMode === "all"
    ? "Enabling all builtin MCPs across every detected agent (--enable-all-mcps)"
    : mcpDefaultMode === "none"
      ? "Skipping recommended MCP enable step (--no-default-mcps)"
      : "Enabling recommended MCP set";
  console.log(`3/4 ${modeLabel}`);
  if (installProfile === "rules-only") {
    console.log("     · default MCP enable step skipped (--profile rules-only)");
  } else {
    await applyBuiltinMcpDefaultState(mcpDefaultMode);
  }
  console.log();

  if (withProject) {
    console.log(`4/4  fulcrum init ${withProject}`);
    const { run: runInit } = await import("./init.ts");
    await runInit(DRY_RUN ? ["--dry-run", withProject] : [withProject]);
  } else {
    console.log("4/4  Skipping project init (use:  fulcrum init <dir>  or re-run with --with-project)");
  }

  console.log("\nDone.");
}
