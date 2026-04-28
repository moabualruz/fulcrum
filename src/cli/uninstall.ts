// fulcrum uninstall — remove Fulcrum-managed install artifacts.
//
// Conservative by default: remove sentinel-spliced rules, managed skill
// namespaces, hook snippets/markers, generated Gemini import lines, and
// Fulcrum-managed context-mode registrations. Leave user-edited policy files
// and third-party caveman installs alone unless an explicit flag says otherwise.

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AGENTS } from "../agents/registry.ts";
import { which, run as runProc } from "../utils/proc.ts";

const BEGIN = "<!-- BEGIN FULCRUM RULES -->";
const END = "<!-- END FULCRUM RULES -->";

let DRY_RUN = false;

export function setDryRun(v: boolean): void {
  DRY_RUN = v;
}

function repoRoot(): string {
  return process.env["FULCRUM_REPO_DIR"] ?? process.cwd();
}

function fulcrumHome(): string {
  return process.env["FULCRUM_HOME"] ?? `${process.env["HOME"]}/.fulcrum`;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function wf(path: string, data: string): Promise<void> {
  if (DRY_RUN) {
    console.log(`     [dry-run] would write: ${path}`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

async function removePath(path: string, label: string): Promise<void> {
  if (!(await exists(path))) {
    console.log(`     · ${label} not present`);
    return;
  }
  if (DRY_RUN) {
    console.log(`     [dry-run] would remove: ${path}`);
    return;
  }
  await rm(path, { recursive: true, force: true });
  console.log(`     - ${label} → ${path}`);
}

function normalizeAfterBlockRemoval(text: string): string {
  const compact = text.replace(/\n{3,}/g, "\n\n").trimEnd();
  return compact ? compact + "\n" : "";
}

export async function removeSentinelBlock(target: string, label: string): Promise<void> {
  if (!(await exists(target))) {
    console.log(`     · ${label} rules file not present`);
    return;
  }

  const existing = await readFile(target, "utf8");
  const nb = (existing.match(new RegExp(BEGIN, "g")) ?? []).length;
  const ne = (existing.match(new RegExp(END, "g")) ?? []).length;
  if (nb === 0 && ne === 0) {
    console.log(`     · ${label} has no Fulcrum rules block`);
    return;
  }
  if (nb !== 1 || ne !== 1) {
    console.log(`     ✗ ${label} refused: ${target} has ${nb} BEGIN / ${ne} END markers (expected 1/1). Fix manually.`);
    return;
  }

  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END) + END.length;
  let before = existing.slice(0, start);
  let after = existing.slice(end);
  if (before.endsWith("\n") && after.startsWith("\n")) {
    after = after.slice(1);
  }
  const out = normalizeAfterBlockRemoval(before + after);
  await wf(target, out);
  console.log(`     - ${label} rules block → ${target}`);
}

export async function removeExactLine(target: string, line: string, label: string): Promise<void> {
  if (!(await exists(target))) {
    console.log(`     · ${label} not present`);
    return;
  }
  const existing = await readFile(target, "utf8");
  const lines = existing.split(/\r?\n/);
  const next = lines.filter((l) => l.trim() !== line).join("\n").replace(/\n+$/, "");
  const out = next ? next + "\n" : "";
  if (out === existing) {
    console.log(`     · ${label} line not present`);
    return;
  }
  await wf(target, out);
  console.log(`     - ${label} line removed → ${target}`);
}

async function removePolicy(purge: boolean): Promise<void> {
  const dst = `${fulcrumHome()}/tool-output-policy.toml`;
  if (!(await exists(dst))) {
    console.log("     · tool-output policy not present");
    return;
  }

  if (purge) {
    await removePath(dst, "tool-output policy");
    return;
  }

  const src = `${repoRoot()}/config/tool-output-policy.toml`;
  if (!(await exists(src))) {
    console.log(`     · keep policy (cannot compare without ${src})`);
    return;
  }

  const current = await readFile(dst, "utf8");
  const shipped = await readFile(src, "utf8");
  if (current !== shipped) {
    console.log(`     · keep policy (modified): ${dst}`);
    return;
  }
  await removePath(dst, "unmodified tool-output policy");
}

/**
 * Run a command best-effort: log + continue on failure, never throw.
 * Skips in dry-run mode.
 */
async function runBestEffort(cmd: string[], label: string): Promise<void> {
  if (DRY_RUN) {
    console.log(`     [dry-run] would run: ${cmd.join(" ")}`);
    return;
  }
  const r = await runProc(cmd);
  if (r.exit !== 0) {
    console.log(`     · ${label} failed (exit ${r.exit}): ${r.stderr.trim() || r.stdout.trim()} — continuing`);
  } else {
    console.log(`     ✓ ${label}`);
  }
}

async function removeSkillNamespaces(home: string): Promise<void> {
  // W1.6: Before removing the fulcrum-upstream namespace for Claude Code,
  // uninstall any upstream skills that were installed via `claude plugin`.
  // Load the lockfile and call `claude plugin uninstall <name>` for each entry
  // with a claude_plugin field. Best-effort: log + continue.
  const claudeDir = `${home}/.claude`;
  if (await exists(claudeDir) && (await which("claude"))) {
    try {
      const { loadUpstreamSkills } = await import("./upstream-skills.ts");
      const repoRoot = process.env["FULCRUM_REPO_DIR"] ?? process.cwd();
      const lockPath = `${repoRoot}/skills/upstream.lock`;
      const skills = await loadUpstreamSkills(lockPath);
      for (const skill of skills) {
        if (skill.claude_plugin) {
          await runBestEffort(
            ["claude", "plugin", "uninstall", skill.claude_plugin.name],
            `Claude Code ${skill.name} plugin uninstall`,
          );
        }
      }
    } catch {
      // lockfile may not be present in all contexts — best-effort
    }
  }

  for (const agent of AGENTS) {
    if (agent.id === "gemini") {
      await removePath(`${home}/.gemini/extensions/fulcrum-skills`, "Gemini fulcrum-skills extension");
      await removePath(`${home}/.gemini/extensions/fulcrum-upstream-skills`, "Gemini fulcrum-upstream-skills extension");
      continue;
    }
    await removePath(`${agent.skillsDir(home)}/fulcrum`, `${agent.label} fulcrum skill namespace`);
    await removePath(`${agent.skillsDir(home)}/fulcrum-upstream`, `${agent.label} fulcrum-upstream skill namespace`);
  }
}

async function removeCavemanCopies(home: string): Promise<void> {
  // W1.1: Claude Code — call `claude plugin uninstall caveman@caveman` when
  // Claude is detected and `claude` is on PATH. Best-effort: log + continue.
  const claudeDir = `${home}/.claude`;
  if (await exists(claudeDir)) {
    if (await which("claude")) {
      await runBestEffort(
        ["claude", "plugin", "uninstall", "caveman@caveman"],
        "Claude Code caveman plugin uninstall",
      );
    } else {
      console.log("     · Claude Code caveman: `claude` not on PATH — manual: claude plugin uninstall caveman@caveman");
    }
  }

  // W1.2: Gemini CLI — call `gemini extensions uninstall caveman` when Gemini
  // is detected and `gemini` is on PATH. Best-effort: log + continue.
  const geminiDir = `${home}/.gemini`;
  if (await exists(geminiDir)) {
    if (await which("gemini")) {
      await runBestEffort(
        ["gemini", "extensions", "uninstall", "caveman"],
        "Gemini CLI caveman extension uninstall",
      );
    } else {
      console.log("     · Gemini CLI caveman: `gemini` not on PATH — manual: gemini extensions uninstall caveman");
    }
  }

  // W1.4: Codex/OpenCode/Pi — call `npx skills remove caveman` for each
  // detected agent. Fallback to removePath when npx is not available.
  const npxPath = await which("npx");
  const npxAgents: Array<{ dir: string; label: string; agent: typeof AGENTS[number] }> = [
    { dir: `${home}/.codex`, label: "Codex CLI", agent: AGENTS.find((a) => a.id === "codex")! },
    { dir: `${home}/.config/opencode`, label: "OpenCode", agent: AGENTS.find((a) => a.id === "opencode")! },
    { dir: `${home}/.pi/agent`, label: "Pi CLI", agent: AGENTS.find((a) => a.id === "pi")! },
  ];
  for (const { dir, label, agent } of npxAgents) {
    if (!(await exists(dir))) continue;
    if (npxPath) {
      // npx skills remove does not need an -a flag — it auto-detects from cwd/env.
      // Pass --yes to suppress interactive prompts (Bash 3.2-safe: no arrays).
      await runBestEffort(
        ["npx", "skills", "remove", "caveman", "--yes"],
        `${label} caveman skills remove via npx`,
      );
    } else {
      // Fallback: file-system removal of the install dir.
      await removePath(agent.cavemanInstallDir(home), `${label} caveman install (fs fallback)`);
    }
  }

  // Always remove the file-system copies as cleanup (idempotent: removePath is
  // a no-op if the path is already gone after npx remove).
  for (const agent of AGENTS) {
    await removePath(agent.cavemanInstallDir(home), `${agent.label} caveman install dir`);
  }

  const cfgPath = process.env["XDG_CONFIG_HOME"]
    ? `${process.env["XDG_CONFIG_HOME"]}/caveman/config.json`
    : `${home}/.config/caveman/config.json`;
  await removePath(cfgPath, "caveman config");
}

export async function run(args: string[]): Promise<void> {
  let purge = false;
  let includeCaveman = false;
  DRY_RUN = false;

  for (const arg of args) {
    if (arg === "--dry-run") {
      DRY_RUN = true;
    } else if (arg === "--purge") {
      purge = true;
    } else if (arg === "--include-caveman") {
      includeCaveman = true;
    } else {
      console.error(`fulcrum uninstall: unknown arg '${arg}'`);
      process.exit(2);
    }
  }

  if (DRY_RUN) {
    console.log("(dry-run mode — no files will be removed or written)\n");
  }

  const home = process.env["HOME"] ?? "";
  console.log("Fulcrum uninstall\n");

  console.log("1/7  Removing Fulcrum rules blocks");
  for (const agent of AGENTS) {
    await removeSentinelBlock(agent.rulesFile(home), agent.label);
  }
  console.log();

  console.log("2/7  Removing generated Gemini import");
  await removeExactLine(`${home}/.gemini/GEMINI.md`, "@AGENTS.md", "Gemini @AGENTS.md import");
  console.log();

  console.log("3/7  Removing hook snippets and markers");
  const { removeAllHookRegistrations } = await import("./hooks.ts");
  await removeAllHookRegistrations();
  await removePath(`${fulcrumHome()}/hooks/snippets`, "hook snippets");
  await removePath(`${fulcrumHome()}/hooks/enabled`, "hook enable markers");
  console.log();

  console.log("4/7  Removing managed skill namespaces");
  await removeSkillNamespaces(home);
  console.log();

  console.log("5/7  Removing DeepWiki MCP registrations");
  const { uninstallDeepwikiMcp } = await import("./mcp.ts");
  await uninstallDeepwikiMcp({ dryRun: DRY_RUN });
  console.log();

  console.log("6/7  Removing context-mode registrations");
  const { uninstallContextMode } = await import("./context-mode.ts");
  await uninstallContextMode({ dryRun: DRY_RUN });
  console.log();

  console.log("7/7  Removing policy and optional third-party installs");
  await removePolicy(purge);
  if (includeCaveman) {
    await removeCavemanCopies(home);
  } else {
    console.log("     · keep caveman (use --include-caveman to remove Fulcrum-installed copies/config)");
  }

  console.log("\nDone.");
}
