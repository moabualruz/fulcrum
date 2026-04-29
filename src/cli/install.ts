// fulcrum install — splice rules/AGENTS.md into each agent's primary rules
// file via <!-- BEGIN/END FULCRUM RULES --> sentinel markers, vendor recipe
// pool, seed tool-output-policy.toml, install caveman and context-mode per
// detected agent.
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
//   --no-skills       Do not run authored/upstream skill sync during install.
//   --no-upstream-skills
//                      Do not install curated third-party skill packs.
//   --no-default-mcps Register MCP definitions/config, but skip the minimal
//                      default enable step and leave existing MCP state intact.
//   --enable-all-mcps Enable every builtin MCP after registration.

import { mkdir, readFile, writeFile, copyFile, readdir, stat, appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { which, run as runProc } from "../utils/proc.ts";
import { AGENTS } from "../agents/registry.ts";

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


const BEGIN = "<!-- BEGIN FULCRUM RULES -->";
const END   = "<!-- END FULCRUM RULES -->";

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
    const out = existing.replace(
      new RegExp(`${BEGIN}[\\s\\S]*?${END}`, "m"),
      `${BEGIN}\n${body}\n${END}`,
    );
    await wf(target, out);
    console.log(`     ↻ ${label}  (block replaced) → ${target}`);
  } else {
    const sep = existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "";
    await wf(target, `${existing}${sep}${BEGIN}\n${body}\n${END}\n`);
    console.log(`     + ${label}  (block appended) → ${target}`);
  }
}

// Derive splice targets from the central agent registry.
// Gemini's rulesFile (~/AGENTS.md) must always be created even if ~/.gemini
// doesn't exist yet — that's the @AGENTS.md import source for GEMINI.md.
const _home = process.env["HOME"] ?? "";
const TARGETS: Array<{ path: string; label: string; alwaysCreate?: boolean }> = [
  ...AGENTS
    .filter((a) => a.id !== "gemini")
    .map((a) => ({ path: a.rulesFile(_home), label: a.label })),
  {
    path: AGENTS.find((a) => a.id === "gemini")!.rulesFile(_home),
    label: "Gemini source (referenced via @AGENTS.md)",
    alwaysCreate: true,
  },
];

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

async function geminiShim(): Promise<void> {
  const home = process.env["HOME"];
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

/**
 * Install caveman into all detected agents.
 * Fail-soft per agent: log and continue on any error.
 *
 * HARD RULE: never write to ~/.agents/ — enforced via assertNotAgentsPath.
 */
export async function installCaveman(home: string): Promise<void> {
  // --- Claude Code ---
  const claudeDir = `${home}/.claude`;
  if (await isDir(claudeDir)) {
    const compressDir = `${claudeDir}/plugins/cache/caveman/caveman`;
    if ((await isClaudePluginInstalled(home, "caveman@caveman")) && (await isDir(compressDir))) {
      console.log("     · skip Claude Code caveman (already installed)");
    } else if (!(await which("claude"))) {
      console.log("     · skip Claude Code (claude not on PATH)  — manual: claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman@caveman");
    } else {
      const r1 = await runProcDry(["claude", "plugin", "marketplace", "add", "JuliusBrussee/caveman"]);
      if (r1.exit !== 0) {
        console.log(`     ✗ Claude Code caveman marketplace add failed: ${r1.stderr.trim()} — manual: claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman@caveman`);
      } else {
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

  // --- W1.3: Codex, OpenCode, Pi — canonical `npx skills add` path (no -a flag) ---
  // Per upstream README canonical path: `npx skills add JuliusBrussee/caveman`
  // skills.sh auto-detects the agent from cwd/env — the -a flag is not needed.
  // Clone-and-copy fallback removed: the vendor CLI is the only install path.
  const npxPath = await which("npx");

  const npxAgentDefs: Array<{ id: string; dir: string; label: string; skillsRoot: string }> = [
    { id: "codex",    dir: `${home}/.codex`,          label: "Codex CLI", skillsRoot: `${home}/.codex/skills` },
    { id: "opencode", dir: `${home}/.config/opencode`, label: "OpenCode",  skillsRoot: `${home}/.config/opencode/skills` },
    { id: "pi",       dir: `${home}/.pi/agent`,        label: "Pi CLI",    skillsRoot: `${home}/.pi/agent/skills` },
  ];

  for (const ag of npxAgentDefs) {
    if (!(await isDir(ag.dir))) {
      console.log(`     · skip ${ag.label} (not detected)`);
      continue;
    }

    // Idempotency: if the caveman skill dir already exists, skip.
    const cavemanSkillDir = `${ag.skillsRoot}/caveman`;
    if (await isDir(cavemanSkillDir)) {
      console.log(`     · skip ${ag.label} caveman (already installed)`);
      continue;
    }

    if (npxPath) {
      // Canonical vendor path — no -a flag; skills.sh auto-detects agent.
      const r = await runProcDry(["npx", "skills", "add", "JuliusBrussee/caveman"]);
      if (r.exit !== 0) {
        console.log(`     ✗ ${ag.label} caveman npx install failed: ${r.stderr.trim()} — manual: npx skills add JuliusBrussee/caveman`);
      } else {
        console.log(`     ✓ ${ag.label} caveman installed via npx skills add`);
      }
    } else {
      console.log(`     · ${ag.label}: npx not on PATH — manual: npx skills add JuliusBrussee/caveman`);
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
    } catch {
      // malformed JSON — overwrite below
    }
  }
  await mk(cfgDir);
  await wf(cfgPath, JSON.stringify({ defaultMode: "ultra" }, null, 2) + "\n");
  console.log(`     ✓ caveman defaultMode set to 'ultra' (${cfgPath})`);
}

// ── MCP registry install helpers ────────────────────────────────────────────

const REPOMIX_PLUGINS = ["repomix-mcp", "repomix-commands", "repomix-explorer"] as const;
const REPOMIX_MARKETPLACE = "yamadashy/repomix";
const REPOMIX_MARKER_FILE = "repomix-claude.installed";

function fulcrumStateDir(): string {
  return `${fulcrumHome()}/state/global`;
}

async function installRepomixClaudePlugins(home: string): Promise<void> {
  if (!(await isDir(`${home}/.claude`))) {
    console.log("     · skip repomix Claude plugins (Claude Code not detected)");
    return;
  }
  if (!(await which("claude"))) {
    console.log("     · skip repomix Claude plugins (claude not on PATH)");
    return;
  }

  const markerFile = `${fulcrumStateDir()}/${REPOMIX_MARKER_FILE}`;
  if (await exists(markerFile)) {
    console.log("     · repomix Claude plugins already installed (marker present)");
    return;
  }

  // Add marketplace.
  const r1 = await runProcDry(["claude", "plugin", "marketplace", "add", REPOMIX_MARKETPLACE]);
  if (r1.exit !== 0 && !DRY_RUN) {
    console.log(`     ✗ repomix marketplace add failed: ${r1.stderr.trim()} — skip plugin installs`);
    return;
  }
  console.log("     ✓ repomix marketplace added");

  // Install each plugin.
  let allOk = true;
  for (const plugin of REPOMIX_PLUGINS) {
    const r = await runProcDry(["claude", "plugin", "install", `${plugin}@repomix`]);
    if (r.exit !== 0 && !DRY_RUN) {
      console.log(`     ✗ claude plugin install ${plugin}@repomix failed: ${r.stderr.trim()}`);
      allOk = false;
    } else {
      console.log(`     ✓ claude plugin install ${plugin}@repomix`);
    }
  }

  // Write marker only when all succeeded (or dry-run).
  if (allOk || DRY_RUN) {
    if (!DRY_RUN) {
      await mk(fulcrumStateDir());
      await wf(markerFile, new Date().toISOString() + "\n");
    } else {
      console.log(`     [dry-run] would write marker: ${markerFile}`);
    }
  }
}

type McpDefaultMode = "minimal" | "none" | "all";

/**
 * Register all builtin MCPs in the registry. Registration is always config-only;
 * default state is applied separately by applyBuiltinMcpDefaultState().
 */
export async function installMcpRegistryEntries(home: string): Promise<void> {
  const { registerServer, applyToAgents } = await import("./mcp-registry.ts");
  const { BUILTIN_MCPS } = await import("./mcp-builtins.ts");

  for (const { name, spec } of BUILTIN_MCPS) {
    if (DRY_RUN) {
      const defaultState = spec.default_enabled ? "minimal-default" : "opt-in";
      console.log(`     [dry-run] would register ${name} MCP (${defaultState}; enable with: fulcrum mcp enable ${name})`);
      continue;
    }
    await registerServer(name, spec);
    const defaultState = spec.default_enabled ? "minimal-default" : "opt-in";
    console.log(`     ✓ ${name} MCP registered (${defaultState}; enable with: fulcrum mcp enable ${name})`);
    await applyToAgents(name);
  }

  // Dart hint: doctor also reports this, but surface it at install time too.
  if (!(await which("dart"))) {
    console.log("     · dart not on PATH — dart MCP requires Dart SDK ≥ 3.9.0-163.0.dev; see: https://github.com/dart-lang/ai/tree/main/pkgs/dart_mcp_server");
  }

  // Install repomix Claude plugins (Claude-specific vendor install).
  await installRepomixClaudePlugins(home);

  const { installRepomixPackageMirrors } = await import("./repomix-package.ts");
  await installRepomixPackageMirrors({ dryRun: DRY_RUN });
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
        if (server.enabled[agentId] === undefined) {
          server.enabled[agentId] = true;
        }
      }
      await saveRegistry(reg);
    } else {
      await setEnabled(name, true, { agents: [...ALL_AGENT_IDS] });
    }
    await applyToAgents(name);
    if (mode === "minimal") {
      console.log(`     ✓ ${name} minimal default applied where no user state existed`);
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

  console.log("1/9  Vendoring hook registration snippets → ~/.fulcrum/hooks/snippets/");
  await vendorHookSnippets();
  console.log();

  console.log("2/9  Seeding ~/.fulcrum/tool-output-policy.toml");
  await seedPolicy();
  console.log();

  console.log("3/9  Splicing rules/AGENTS.md into per-agent rules files");
  const rulesPath = `${root}/rules/AGENTS.md`;
  if (!(await exists(rulesPath))) {
    console.error(`fulcrum install: cannot find ${rulesPath}`);
    process.exit(1);
  }
  const body = (await readFile(rulesPath, "utf8")).trimEnd();
  for (const t of TARGETS) {
    const parent = dirname(t.path);
    if (!t.alwaysCreate && !(await isDir(parent)) && !(await exists(t.path))) {
      console.log(`     · skip ${t.label} (parent dir not present)`);
      continue;
    }
    await spliceSentinel(t.path, body, t.label);
  }
  await geminiShim();
  console.log();

  const home = process.env["HOME"] ?? "";
  console.log("4/9  Installing caveman per detected agent");
  await installCaveman(home);
  console.log();

  console.log("5/9  Installing context-mode per detected agent");
  const { installContextMode } = await import("./context-mode.ts");
  await installContextMode({ dryRun: DRY_RUN });
  console.log();

  if (syncAuthoredSkills) {
    console.log("6/9  Syncing in-repo skills per detected agent");
    const { syncSkills } = await import("./skills.ts");
    await syncSkills({ dryRun: DRY_RUN });
  } else {
    console.log("6/9  Skipping in-repo skill sync (--no-skills)");
  }
  console.log();

  if (syncUpstream) {
    console.log("7/9  Syncing curated third-party skills per detected agent");
    const { syncUpstreamSkills } = await import("./upstream-skills.ts");
    await syncUpstreamSkills({ dryRun: DRY_RUN });
  } else {
    console.log("7/9  Skipping curated third-party skill sync (--no-upstream-skills)");
  }
  console.log();

  console.log("7b/9 Installing vendor capability packages");
  const { installVendorCapabilityPackages } = await import("./vendor-packages.ts");
  await installVendorCapabilityPackages({ dryRun: DRY_RUN });
  console.log();

  console.log("8/9  Registering DeepWiki MCP where supported");
  const { installDeepwikiMcp } = await import("./mcp.ts");
  await installDeepwikiMcp({ dryRun: DRY_RUN });
  console.log();

  console.log("8b/9 Registering MCP registry entries (github, repomix, semgrep, context7, tavily, playwright, cloudflare-*, dart)");
  await installMcpRegistryEntries(home);
  console.log();

  const modeLabel = mcpDefaultMode === "all"
    ? "Enabling all builtin MCPs across every detected agent (--enable-all-mcps)"
    : mcpDefaultMode === "none"
      ? "Skipping minimal default MCP enable step (--no-default-mcps)"
      : "Enabling minimal default MCP set";
  console.log(`8c/9 ${modeLabel}`);
  await applyBuiltinMcpDefaultState(mcpDefaultMode);
  console.log();

  if (withProject) {
    console.log(`9/9  fulcrum init ${withProject}`);
    const { run: runInit } = await import("./init.ts");
    await runInit([withProject]);
  } else {
    console.log("9/9  Skipping project init (use:  fulcrum init <dir>  or re-run with --with-project)");
  }

  console.log("\nDone.");
}
