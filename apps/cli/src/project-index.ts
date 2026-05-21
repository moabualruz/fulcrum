// project-index.ts: run vendor-default project-index commands in a directory.
//
// Scope: tools that produce a precomputed index artifact for the project
// ast-grep, grep, etc) are NOT here: they have no index to build.
//
// Rules:
//   - NEVER pass --output / --out / path-override flags. Vendor defaults apply.
//   - Skip silently when the binary is missing (BYO toolchain).
//   - Fail-soft per tool: log warning and continue on any error.
//     update .`).

import { which, run as runProc } from "@platform-core/application/runtime-support/process-runner.ts";

interface IndexCommand {
  /** Human label for log output. */
  label: string;
  /** Binary that must be on PATH. */
  bin: string;
  /** Argv passed verbatim to the binary. NO --output / path overrides. */
  args: string[];
}

const INDEX_COMMANDS: IndexCommand[] = [
];

/** Run every vendor-default project-index command in dir. */
export async function runProjectIndex(
  dir: string,
  opts: { dryRun: boolean },
): Promise<void> {
  const { dryRun } = opts;
  console.log("\nProject indices:");
  for (const cmd of INDEX_COMMANDS) {
    if (!(await which(cmd.bin))) {
      console.log(`  · ${cmd.bin} not on PATH: skipping ${cmd.label}`);
      continue;
    }
    if (dryRun) {
      console.log(`  [dry-run] would run: ${cmd.bin} ${cmd.args.join(" ")}  (cwd=${dir})`);
      continue;
    }
    try {
      const r = await runProc([cmd.bin, ...cmd.args], { cwd: dir });
      if (r.exit !== 0) {
        console.warn(`  ⚠ ${cmd.label} failed (exit ${r.exit}): ${r.stderr.trim() || r.stdout.trim()}`);
      } else {
        console.log(`  ✓ ${cmd.label}`);
      }
    } catch (e) {
      console.warn(`  ⚠ ${cmd.label} error: ${String(e)}`);
    }
  }
}
