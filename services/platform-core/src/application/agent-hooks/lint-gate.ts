// Lint gate — exit 2 with stderr feedback if the just-edited file has lint errors.
// Multi-language; fail-open per language (skip if linter not installed).

import { readHookEvent } from "@platform-core/application/runtime-support/hook-event-io.ts";
import { which, run } from "@platform-core/application/runtime-support/process-runner.ts";

const TABLE: Array<{ pattern: RegExp; cmd: string; args: (file: string) => string[] }> = [
  { pattern: /\.py$/,                cmd: "ruff",          args: (f) => ["check", "--quiet", f] },
  { pattern: /\.(ts|tsx|js|jsx)$/,   cmd: "biome",         args: (f) => ["check", f] },
  { pattern: /\.go$/,                cmd: "golangci-lint", args: (f) => ["run", f] },
];

export async function runHook(): Promise<void> {
  const event = await readHookEvent();
  const file = event.tool_input?.file_path;
  if (!file || typeof file !== "string") return;
  if (!(await Bun.file(file).exists())) return;

  for (const { pattern, cmd, args } of TABLE) {
    if (!pattern.test(file)) continue;
    if (!(await which(cmd))) return; // fail-open

    const result = await run([cmd, ...args(file)]);
    if (result.exit !== 0) {
      process.stderr.write(result.stderr || result.stdout);
      process.stderr.write(`\nlint-gate: violations in ${file} — fix before continuing\n`);
      process.exit(2);
    }
    return;
  }
}
