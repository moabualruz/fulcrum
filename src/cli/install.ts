// fulcrum install — splice rules/AGENTS.md into each agent's primary rules
// file via <!-- BEGIN/END FULCRUM RULES --> sentinel markers, vendor recipe
// pool, seed tool-output-policy.toml.
//
// Idempotent. Non-destructive: user content outside the markers is preserved.

import { mkdir, readFile, writeFile, copyFile, readdir, stat, appendFile } from "node:fs/promises";
import { dirname, basename } from "node:path";

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

async function spliceSentinel(target: string, body: string, label: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
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
    await writeFile(target, out);
    console.log(`     ↻ ${label}  (block replaced) → ${target}`);
  } else {
    const sep = existing && !existing.endsWith("\n") ? "\n\n" : existing ? "\n" : "";
    await writeFile(target, `${existing}${sep}${BEGIN}\n${body}\n${END}\n`);
    console.log(`     + ${label}  (block appended) → ${target}`);
  }
}

const TARGETS: Array<{ path: string; label: string; alwaysCreate?: boolean }> = [
  { path: `${process.env["HOME"]}/.claude/CLAUDE.md`,                label: "Claude Code" },
  { path: `${process.env["HOME"]}/.codex/AGENTS.md`,                 label: "Codex CLI" },
  { path: `${process.env["HOME"]}/.config/opencode/AGENTS.md`,       label: "OpenCode" },
  { path: `${process.env["HOME"]}/.pi/agent/AGENTS.md`,              label: "Pi CLI" },
  { path: `${process.env["HOME"]}/AGENTS.md`,                        label: "Gemini source (referenced via @AGENTS.md)", alwaysCreate: true },
];

async function vendorHookSnippets(): Promise<void> {
  const root = repoRoot();
  const src = `${root}/hooks/recipes`;
  const dst = `${fulcrumHome()}/hooks/snippets`;
  if (!(await isDir(src))) {
    console.log(`     · no hook recipes in ${src} (skip)`);
    return;
  }
  await mkdir(dst, { recursive: true });
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (entry.name.endsWith(".snippet.md")) {
      await copyFile(`${src}/${entry.name}`, `${dst}/${entry.name}`);
    }
  }
  const installed = (await readdir(dst)).filter((f) => f.endsWith(".snippet.md"));
  console.log(`     vendored ${installed.length} snippet(s)`);
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
  await mkdir(fulcrumHome(), { recursive: true });
  await copyFile(src, dst);
  console.log(`     installed default policy: ${dst}`);
}

async function geminiShim(): Promise<void> {
  const home = process.env["HOME"];
  const gemDir = `${home}/.gemini`;
  if (!(await isDir(gemDir))) return;
  const file = `${gemDir}/GEMINI.md`;
  let body = "";
  if (await exists(file)) body = await readFile(file, "utf8");
  if (!/@AGENTS\.md/.test(body)) {
    await appendFile(file, (body && !body.endsWith("\n") ? "\n" : "") + "@AGENTS.md\n");
    console.log("     ✓ Gemini GEMINI.md updated with @AGENTS.md import");
  }
}

export async function run(args: string[]): Promise<void> {
  let withProject: string | null = null;
  let i = 0;
  while (i < args.length) {
    const a = args[i]!;
    if (a === "--with-project") {
      withProject = args[i + 1] ?? process.cwd();
      i += 2;
    } else {
      console.error(`fulcrum install: unknown arg '${a}'`);
      process.exit(2);
    }
  }

  const root = repoRoot();
  console.log(`Fulcrum install — source: ${root}\n`);

  console.log("1/4  Vendoring hook registration snippets → ~/.fulcrum/hooks/snippets/");
  await vendorHookSnippets();
  console.log();

  console.log("2/4  Seeding ~/.fulcrum/tool-output-policy.toml");
  await seedPolicy();
  console.log();

  console.log("3/4  Splicing rules/AGENTS.md into per-agent rules files");
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

  if (withProject) {
    console.log(`4/4  fulcrum init ${withProject}`);
    const { run: runInit } = await import("./init.ts");
    await runInit([withProject]);
  } else {
    console.log("4/4  Skipping project init (use:  fulcrum init <dir>  or re-run with --with-project)");
  }

  console.log("\nDone.");
  // Keep imports we used elsewhere from being marked unused.
  void basename;
}
