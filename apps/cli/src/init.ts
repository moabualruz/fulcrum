// fulcrum init [DIR]         : bootstrap a project with cross-agent rules + skills paths.
//
// Idempotent: skips files that already exist.

import { stat, mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";

const AGENTS_TEMPLATE = `# AGENTS.md

## Project
<one-line description>

## Stack
- Language / runtime:
- Framework:
- Package manager:
- Test runner:

## Commands
- Install:      <cmd>
- Dev server:   <cmd>
- Test:         <cmd>
- Lint/format:  <cmd>
- Build:        <cmd>

## Conventions
- Branch naming:
- Commit style:
- Code style:

## Do / Don't
- DO …
- DON'T …
`;

const GITIGNORE_LINES = [
  ".claude/settings.local.json",
  ".claude/.cache/",
];

const HELP = `fulcrum init [DIR]

Bootstrap a project with AGENTS.md, .claude/CLAUDE.md, and .gitignore entries.

Usage:
  fulcrum init [DIR]
  fulcrum init --dry-run [DIR]
  fulcrum init reindex [DIR]
`;

/** Dry-run state: set by tests or --dry-run flag. */
let DRY_RUN = false;

/** Toggle dry-run mode (used by tests). */
export function setDryRun(v: boolean): void { DRY_RUN = v; }

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function wf(path: string, data: string): Promise<void> {
  if (DRY_RUN) {
    console.log(`  [dry-run] would write: ${path}`);
    return;
  }
  await writeFile(path, data);
}

async function mk(path: string): Promise<void> {
  if (DRY_RUN) {
    console.log(`  [dry-run] would mkdir: ${path}`);
    return;
  }
  await mkdir(path, { recursive: true });
}

async function af(path: string, data: string): Promise<void> {
  if (DRY_RUN) {
    console.log(`  [dry-run] would append: ${path}`);
    return;
  }
  await appendFile(path, data);
}


export async function run(args: string[]): Promise<void> {
  if (args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    console.log(HELP);
    return;
  }

  // Handle `fulcrum init reindex [DIR]` subcommand.
  if (args[0] === "reindex") {
    DRY_RUN = false;
    const tail = args.slice(1);
    const filtered: string[] = [];
    for (const a of tail) {
      if (a === "--dry-run") DRY_RUN = true;
      else filtered.push(a);
    }
    const dir = resolve(filtered[0] ?? process.cwd());
    if (!(await exists(dir))) {
      console.error(`fulcrum init reindex: not a directory: ${dir}`);
      process.exit(1);
    }
    console.log(`fulcrum init reindex → ${dir}`);
    const { runProjectIndex } = await import("./project-index.ts");
    await runProjectIndex(dir, { dryRun: DRY_RUN });
    console.log("\nDone.");
    return;
  }

  // Parse --dry-run flag.
  DRY_RUN = false;
  const filteredArgs: string[] = [];
  for (const a of args) {
    if (a === "--dry-run") { DRY_RUN = true; }
    else { filteredArgs.push(a); }
  }
  if (DRY_RUN) console.log("(dry-run mode: no files will be written)\n");

  const dir = resolve(filteredArgs[0] ?? process.cwd());
  if (!(await exists(dir))) {
    console.error(`fulcrum init: not a directory: ${dir}`);
    process.exit(1);
  }
  const home = process.env["HOME"] ?? "";
  console.log(`fulcrum init → ${dir}`);

  // AGENTS.md
  const agentsPath = `${dir}/AGENTS.md`;
  if (!(await exists(agentsPath))) {
    await wf(agentsPath, AGENTS_TEMPLATE);
    console.log("  + AGENTS.md  (template)");
  } else {
    console.log("  · AGENTS.md  (kept)");
  }

  // .claude/CLAUDE.md → @AGENTS.md import
  await mk(`${dir}/.claude/skills`);
  const claudePath = `${dir}/.claude/CLAUDE.md`;
  if (!(await exists(claudePath))) {
    await wf(claudePath, "@AGENTS.md\n");
    console.log("  + .claude/CLAUDE.md  (@AGENTS.md import)");
  } else {
    console.log("  · .claude/CLAUDE.md  (kept)");
  }
  if (!(await exists(`${dir}/.claude/skills/.gitkeep`))) {
    await wf(`${dir}/.claude/skills/.gitkeep`, "");
  }

  // GEMINI.md only if Gemini-marker present
  if ((await exists(`${dir}/.gemini`)) || (await exists(`${dir}/GEMINI.md`))) {
    const geminiPath = `${dir}/GEMINI.md`;
    if (!(await exists(geminiPath))) {
      await wf(geminiPath, "@AGENTS.md\n");
      console.log("  + GEMINI.md  (@AGENTS.md import)");
    }
  }

  // .gitignore additions (idempotent)
  const giPath = `${dir}/.gitignore`;
  let gi = "";
  if (await exists(giPath)) {
    gi = await readFile(giPath, "utf8");
  }
  let added = false;
  for (const line of GITIGNORE_LINES) {
    const re = new RegExp(`^${line.replace(/[.+^${}()|[\]\\]/g, "\\$&")}$`, "m");
    if (!re.test(gi)) {
      await af(giPath, (gi.length && !gi.endsWith("\n") ? "\n" : "") + line + "\n");
      console.log(`  + .gitignore += ${line}`);
      added = true;
      gi += line + "\n";
    }
  }
  if (!added) console.log("  · .gitignore  (kept)");

  // Vendor integrations: per-agent skill/plugin/extension/hook installers.
  const { runVendorIntegrations } = await import("./vendor-installs.ts");
  await runVendorIntegrations(dir, home, { dryRun: DRY_RUN });

  // Project indices: vendor-default index builds for tools that produce a
  // matchers (rg, fd, ast-grep, …) need no index, so they are NOT here.
  const { runProjectIndex } = await import("./project-index.ts");
  await runProjectIndex(dir, { dryRun: DRY_RUN });

  console.log("\nDone.");
}
