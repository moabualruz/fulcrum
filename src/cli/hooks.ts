// fulcrum hooks list / enable / disable.
//
// `enable <name>` is now informational — the hook *logic* lives inside this
// binary as `fulcrum hook <name>`. Enabling means: print the per-agent
// registration snippet so the user can wire it into each agent's config.
// We also drop a marker file at ~/.fulcrum/hooks/enabled/<name> for state.

import { mkdir, writeFile, unlink, readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const RECIPE_NAMES = [
  "format",
  "lint-gate",
  "pm-policy",
  "test-on-edit",
  "audit-log",
  "index-check",
  "index-rebuild",
  "tool-output-router",
] as const;

function homeFulcrum(): string {
  return process.env["FULCRUM_HOME"] ?? `${process.env["HOME"]}/.fulcrum`;
}

function snippetPath(name: string): string[] {
  // Look in repo first (when invoked from a clone), then in installed pool.
  const repo = process.env["FULCRUM_REPO_DIR"] ?? "";
  const home = homeFulcrum();
  const candidates: string[] = [];
  if (repo) candidates.push(`${repo}/hooks/recipes/${name}.snippet.md`);
  candidates.push(`${home}/hooks/snippets/${name}.snippet.md`);
  return candidates;
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

async function listEnabled(): Promise<Set<string>> {
  const dir = `${homeFulcrum()}/hooks/enabled`;
  try {
    const items = await readdir(dir);
    return new Set(items);
  } catch {
    return new Set();
  }
}

async function cmdList(): Promise<void> {
  const enabled = await listEnabled();
  console.log("Available hooks (subcommands of `fulcrum hook <name>`):");
  for (const name of RECIPE_NAMES) {
    const mark = enabled.has(name) ? "✓" : " ";
    console.log(`  ${mark} ${name}`);
  }
  console.log(`\n${enabled.size} of ${RECIPE_NAMES.length} marked enabled. Marker dir: ${homeFulcrum()}/hooks/enabled/`);
  console.log("`enable <name>` records intent + prints the per-agent registration snippet.");
}

async function cmdEnable(name: string | undefined): Promise<void> {
  if (!name) {
    console.error("usage: fulcrum hooks enable <name>");
    process.exit(2);
  }
  if (!(RECIPE_NAMES as readonly string[]).includes(name)) {
    console.error(`fulcrum hooks: unknown recipe '${name}'. List available with: fulcrum hooks list`);
    process.exit(2);
  }
  const markerDir = `${homeFulcrum()}/hooks/enabled`;
  await mkdir(markerDir, { recursive: true });
  await writeFile(`${markerDir}/${name}`, "");
  console.log(`Marked enabled: ${markerDir}/${name}`);

  // Print snippet (try repo, fall back to installed pool).
  let snippet = "";
  for (const p of snippetPath(name)) {
    if (await exists(p)) {
      snippet = await readFile(p, "utf8");
      break;
    }
  }
  if (!snippet) {
    console.log("(no registration snippet documented — see docs/hooks.md §6 for the cross-agent mapping)");
    return;
  }
  console.log("\n── Registration snippet (paste into each agent's config) ──");
  process.stdout.write(snippet);
}

async function cmdDisable(name: string | undefined): Promise<void> {
  if (!name) {
    console.error("usage: fulcrum hooks disable <name>");
    process.exit(2);
  }
  const marker = `${homeFulcrum()}/hooks/enabled/${name}`;
  try {
    await unlink(marker);
    console.log(`Marked disabled: ${marker}`);
    console.log("(also delete the registration entry from each agent's config)");
  } catch {
    console.error(`fulcrum hooks: '${name}' not enabled`);
    process.exit(1);
  }
}

export async function run(args: string[]): Promise<void> {
  const sub = args[0] ?? "list";
  switch (sub) {
    case "list":    return cmdList();
    case "enable":  return cmdEnable(args[1]);
    case "disable": return cmdDisable(args[1]);
    default:
      console.error(`fulcrum hooks: unknown subcommand '${sub}'`);
      process.exit(2);
  }
  // Side note: we record `repoDir` resolution as best-effort for snippet
  // lookup. A clone of fulcrum on disk is the source of truth.
  void resolve; // silence unused import linter rule (resolve isn't used)
}
