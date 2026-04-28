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

import { mkdir, readFile, writeFile, copyFile, readdir, stat, appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { which, run as runProc, cloneOrUpdate } from "../utils/proc.ts";
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
  return runProc(cmd);
}

/** cloneOrUpdate wrapper — skips in dry-run. */
async function cloneOrUpdateDry(url: string, dir: string): Promise<{ exit: number; stdout: string; stderr: string }> {
  if (DRY_RUN) {
    console.log(`     [dry-run] would run: git clone/update ${url} → ${dir}`);
    return { exit: 0, stdout: "", stderr: "" };
  }
  return cloneOrUpdate(url, dir);
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

// Skill subfolders from caveman upstream to copy into each agent's skills root.
// Source: HANDOVER.md §6.1 / task spec. 5 folders (caveman-compress is excluded
// per task spec — upstream ships it nested differently; we carry the usable 5).
const CAVEMAN_SKILLS = ["caveman", "caveman-commit", "caveman-help", "caveman-review", "compress"] as const;

const CAVEMAN_REPO = "https://github.com/JuliusBrussee/caveman";

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
 * Copy all CAVEMAN_SKILLS subfolders from a cloned caveman repo into agentSkillsRoot.
 * assertNotAgentsPath guards each target before any write.
 */
export async function installCavemanByCopy(
  agentSkillsRoot: string,
  opts: { cloneDir: string; home: string }
): Promise<void> {
  assertNotAgentsPath(agentSkillsRoot, opts.home);
  await mk(agentSkillsRoot);
  for (const skill of CAVEMAN_SKILLS) {
    const src = `${opts.cloneDir}/skills/${skill}`;
    const dst = `${agentSkillsRoot}/${skill}`;
    assertNotAgentsPath(dst, opts.home);
    // In dry-run the clone hasn't happened, so skip the isDir check and just
    // report what would be copied.
    if (DRY_RUN) {
      console.log(`     [dry-run] would copy skill: ${src} → ${dst}`);
      continue;
    }
    if (!(await isDir(src))) {
      console.log(`     · caveman skill '${skill}' not found in clone (skip)`);
      continue;
    }
    await copyDirRecursive(src, dst);
  }
}

/** Recursively copy a directory tree src → dst (overwrites; dst created if absent). */
async function copyDirRecursive(src: string, dst: string): Promise<void> {
  await mk(dst);
  for (const entry of await readdir(src, { withFileTypes: true })) {
    const s = `${src}/${entry.name}`;
    const d = `${dst}/${entry.name}`;
    if (entry.isDirectory()) {
      await copyDirRecursive(s, d);
    } else if (entry.isFile()) {
      await cp(s, d);
    }
  }
}

/**
 * Install caveman into all detected agents.
 * Fail-soft per agent: log and continue on any error.
 *
 * HARD RULE: never write to ~/.agents/ — enforced via assertNotAgentsPath.
 */
async function installCaveman(home: string): Promise<void> {
  const fHome = process.env["FULCRUM_HOME"] ?? `${home}/.fulcrum`;
  const cloneDir = `${fHome}/cache/caveman`;

  // --- Claude Code ---
  const claudeDir = `${home}/.claude`;
  if (await isDir(claudeDir)) {
    const pluginCacheDir = `${claudeDir}/plugins/cache/caveman`;
    if (await isDir(pluginCacheDir)) {
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
      console.log("     · skip Gemini CLI (gemini not on PATH)  — manual: gemini extensions install https://github.com/JuliusBrussee/caveman");
    } else {
      const r = await runProcDry(["gemini", "extensions", "install", CAVEMAN_REPO]);
      if (r.exit !== 0) {
        console.log(`     ✗ Gemini CLI caveman install failed: ${r.stderr.trim()} — manual: gemini extensions install ${CAVEMAN_REPO}`);
      } else {
        console.log("     ✓ Gemini CLI caveman installed");
      }
    }
  } else {
    console.log("     · skip Gemini CLI (not detected)");
  }

  // --- Clone/update for Codex, OpenCode, Pi (clone-and-copy pattern) ---
  // Do the clone once; reuse for all three agents.
  let cloneOk = false;
  {
    const r = await cloneOrUpdateDry(CAVEMAN_REPO, cloneDir);
    if (r.exit !== 0) {
      console.log(`     ✗ caveman clone/update failed: ${r.stderr.trim()} — manual: git clone ${CAVEMAN_REPO} ${cloneDir}`);
    } else {
      cloneOk = true;
    }
  }

  // Codex CLI
  const codexDir = `${home}/.codex`;
  if (await isDir(codexDir)) {
    if (!cloneOk) {
      console.log(`     ✗ Codex CLI caveman skipped (clone failed)`);
    } else {
      try {
        await installCavemanByCopy(`${codexDir}/skills`, { cloneDir, home });
        console.log("     ✓ Codex CLI caveman skills installed");
      } catch (e) {
        console.log(`     ✗ Codex CLI caveman install failed: ${String(e)} — manual: copy ${cloneDir}/skills/<name> → ~/.codex/skills/<name>`);
      }
    }
  } else {
    console.log("     · skip Codex CLI (not detected)");
  }

  // OpenCode
  const opencodeDir = `${home}/.config/opencode`;
  if (await isDir(opencodeDir)) {
    if (!cloneOk) {
      console.log(`     ✗ OpenCode caveman skipped (clone failed)`);
    } else {
      try {
        await installCavemanByCopy(`${opencodeDir}/skills`, { cloneDir, home });
        console.log("     ✓ OpenCode caveman skills installed");
      } catch (e) {
        console.log(`     ✗ OpenCode caveman install failed: ${String(e)} — manual: copy ${cloneDir}/skills/<name> → ~/.config/opencode/skills/<name>`);
      }
    }
  } else {
    console.log("     · skip OpenCode (not detected)");
  }

  // Pi CLI
  const piDir = `${home}/.pi/agent`;
  if (await isDir(piDir)) {
    if (!cloneOk) {
      console.log(`     ✗ Pi CLI caveman skipped (clone failed)`);
    } else {
      try {
        await installCavemanByCopy(`${piDir}/skills`, { cloneDir, home });
        console.log("     ✓ Pi CLI caveman skills installed");
      } catch (e) {
        console.log(`     ✗ Pi CLI caveman install failed: ${String(e)} — manual: copy ${cloneDir}/skills/<name> → ~/.pi/agent/skills/<name>`);
      }
    }
  } else {
    console.log("     · skip Pi CLI (not detected)");
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

export async function run(args: string[]): Promise<void> {
  let withProject: string | null = null;
  let syncAuthoredSkills = true;
  let syncUpstream = true;
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
    } else {
      console.error(`fulcrum install: unknown arg '${a}'`);
      process.exit(2);
    }
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

  console.log("8/9  Registering DeepWiki MCP where supported");
  const { installDeepwikiMcp } = await import("./mcp.ts");
  await installDeepwikiMcp({ dryRun: DRY_RUN });
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
