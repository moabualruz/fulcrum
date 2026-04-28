// fulcrum init [DIR]          — bootstrap a project with cross-agent rules + skills paths.
// fulcrum init reindex [DIR]  — run `repomix --compress` in DIR (vendor default output).
//
// Idempotent: skips files that already exist.

import { stat, mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { which, run as runProc } from "../utils/proc.ts";

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

/** Dry-run state — set by tests or --dry-run flag. */
let DRY_RUN = false;

/** Toggle dry-run mode (used by tests). */
export function setDryRun(v: boolean): void { DRY_RUN = v; }

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

/** Run `repomix --compress` in dir with NO --output flag (vendor default = repomix-output.xml). */
async function runReindex(dir: string): Promise<void> {
  if (!(await which("repomix"))) {
    console.log("  · repomix not on PATH — skipping reindex");
    return;
  }
  if (DRY_RUN) {
    console.log(`  [dry-run] would run: repomix --compress  (cwd=${dir})`);
    return;
  }
  const r = await runProc(["repomix", "--compress"], { cwd: dir });
  if (r.exit !== 0) {
    console.warn(`  ⚠ repomix --compress failed (exit ${r.exit}): ${r.stderr.trim()}`);
  } else {
    console.log("  ✓ repomix --compress done");
  }
}

export async function run(args: string[]): Promise<void> {
  // Handle `fulcrum init reindex [DIR]` subcommand.
  if (args[0] === "reindex") {
    const dir = resolve(args[1] ?? process.cwd());
    if (!(await exists(dir))) {
      console.error(`fulcrum init reindex: not a directory: ${dir}`);
      process.exit(1);
    }
    console.log(`fulcrum init reindex → ${dir}`);
    await runReindex(dir);
    console.log("Done.");
    return;
  }

  // Parse --dry-run flag.
  DRY_RUN = false;
  const filteredArgs: string[] = [];
  for (const a of args) {
    if (a === "--dry-run") { DRY_RUN = true; }
    else { filteredArgs.push(a); }
  }
  if (DRY_RUN) console.log("(dry-run mode — no files will be written)\n");

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
    await writeFile(agentsPath, AGENTS_TEMPLATE);
    console.log("  + AGENTS.md  (template)");
  } else {
    console.log("  · AGENTS.md  (kept)");
  }

  // .claude/CLAUDE.md → @AGENTS.md import
  await mkdir(`${dir}/.claude/skills`, { recursive: true });
  const claudePath = `${dir}/.claude/CLAUDE.md`;
  if (!(await exists(claudePath))) {
    await writeFile(claudePath, "@AGENTS.md\n");
    console.log("  + .claude/CLAUDE.md  (@AGENTS.md import)");
  } else {
    console.log("  · .claude/CLAUDE.md  (kept)");
  }
  if (!(await exists(`${dir}/.claude/skills/.gitkeep`))) {
    await writeFile(`${dir}/.claude/skills/.gitkeep`, "");
  }

  // GEMINI.md only if Gemini-marker present
  if ((await exists(`${dir}/.gemini`)) || (await exists(`${dir}/GEMINI.md`))) {
    const geminiPath = `${dir}/GEMINI.md`;
    if (!(await exists(geminiPath))) {
      await writeFile(geminiPath, "@AGENTS.md\n");
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
      await appendFile(giPath, (gi.length && !gi.endsWith("\n") ? "\n" : "") + line + "\n");
      console.log(`  + .gitignore += ${line}`);
      added = true;
      gi += line + "\n";
    }
  }
  if (!added) console.log("  · .gitignore  (kept)");

  // Vendor integrations — run canonical per-tool commands for each detected agent.
  const { runVendorIntegrations } = await import("./init-vendor.ts");
  await runVendorIntegrations(dir, home, { dryRun: DRY_RUN });

  console.log("\nDone.");
}
