// Test on edit — opt-in per project. Reads .fulcrum/test-on-edit.toml in the
// repo; without that file, this hook is a no-op.
//
// Config shape (top-level keys are glob patterns; values are commands;
// {file} is substituted with the edited file path relative to repo root):
//
//   "*.py"      = "pytest -x {file}"
//   "src/*.ts"  = "vitest run {file}"
//
// Output goes to /tmp/<project>-test-on-edit.log; the hook never blocks.

import { tmpdir } from "node:os";
import { parse as parseToml } from "smol-toml";
import { readHookEvent, projectSlug } from "../utils/io.ts";
import { spawnDetached } from "../utils/proc.ts";

function globToRegExp(glob: string): RegExp {
  // Minimal globber: ** → .*, * → [^/]*, ? → [^/]
  let re = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") { re += ".*"; i++; }
      else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (/[.+()^${}|\\\[\]]/.test(c)) re += "\\" + c;
    else re += c;
  }
  re += "$";
  return new RegExp(re);
}

export async function runHook(): Promise<void> {
  const event = await readHookEvent();
  const file = event.tool_input?.file_path;
  if (!file || typeof file !== "string") return;

  const dir = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
  const cfgPath = `${dir}/.fulcrum/test-on-edit.toml`;
  const cfg = Bun.file(cfgPath);
  if (!(await cfg.exists())) return;

  let table: Record<string, string>;
  try {
    table = parseToml(await cfg.text()) as Record<string, string>;
  } catch {
    return;
  }

  const rel = file.startsWith(dir + "/") ? file.slice(dir.length + 1) : file;

  for (const [glob, cmdRaw] of Object.entries(table)) {
    if (typeof cmdRaw !== "string") continue;
    if (!globToRegExp(glob).test(rel)) continue;
    const cmd = cmdRaw.replaceAll("{file}", rel);
    const log = `${tmpdir()}/${projectSlug()}-test-on-edit.log`;
    spawnDetached(["bash", "-lc", `cd '${dir}' && ${cmd}`], { logFile: log });
    return;
  }
}
