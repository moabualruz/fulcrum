// fulcrum uninstall — remove Fulcrum-managed install artifacts.
//
// Conservative by default: remove sentinel-spliced rules, managed skill
// namespaces, hook snippets/markers, and generated Gemini import lines. Leave
// user-edited policy files and third-party caveman installs alone unless an
// explicit flag says otherwise.

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AGENTS } from "../agents/registry.ts";

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

async function removeSkillNamespaces(home: string): Promise<void> {
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
  for (const agent of AGENTS) {
    await removePath(agent.cavemanInstallDir(home), `${agent.label} caveman install`);
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

  console.log("1/6  Removing Fulcrum rules blocks");
  for (const agent of AGENTS) {
    await removeSentinelBlock(agent.rulesFile(home), agent.label);
  }
  console.log();

  console.log("2/6  Removing generated Gemini import");
  await removeExactLine(`${home}/.gemini/GEMINI.md`, "@AGENTS.md", "Gemini @AGENTS.md import");
  console.log();

  console.log("3/6  Removing hook snippets and markers");
  const { removeAllHookRegistrations } = await import("./hooks.ts");
  await removeAllHookRegistrations();
  await removePath(`${fulcrumHome()}/hooks/snippets`, "hook snippets");
  await removePath(`${fulcrumHome()}/hooks/enabled`, "hook enable markers");
  console.log();

  console.log("4/6  Removing managed skill namespaces");
  await removeSkillNamespaces(home);
  console.log();

  console.log("5/6  Removing DeepWiki MCP registrations");
  const { uninstallDeepwikiMcp } = await import("./mcp.ts");
  await uninstallDeepwikiMcp({ dryRun: DRY_RUN });
  console.log();

  console.log("6/6  Removing policy and optional third-party installs");
  await removePolicy(purge);
  if (includeCaveman) {
    await removeCavemanCopies(home);
  } else {
    console.log("     · keep caveman (use --include-caveman to remove Fulcrum-installed copies/config)");
  }

  console.log("\nDone.");
}
