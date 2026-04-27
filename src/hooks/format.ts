// Auto-format on edit — run language-appropriate formatter on the just-edited file.
// Idempotent, non-blocking, fail-open per language.

import { readHookEvent } from "../utils/io.ts";
import { which, run } from "../utils/proc.ts";

interface Formatter {
  cmd: string;
  args: (file: string) => string[];
}

const TABLE: Array<{ pattern: RegExp; formatter: Formatter; alt?: Formatter }> = [
  { pattern: /\.py$/,                               formatter: { cmd: "ruff",        args: (f) => ["format", f] } },
  { pattern: /\.(ts|tsx|js|jsx|json|md)$/,
    formatter: { cmd: "biome",     args: (f) => ["format", "--write", f] },
    alt:       { cmd: "prettier",  args: (f) => ["--write", f] } },
  { pattern: /\.go$/,                               formatter: { cmd: "gofmt",       args: (f) => ["-w", f] } },
  { pattern: /\.rs$/,                               formatter: { cmd: "rustfmt",     args: (f) => [f] } },
  { pattern: /\.java$/,                             formatter: { cmd: "google-java-format", args: (f) => ["--replace", f] } },
  { pattern: /\.kts?$/,                             formatter: { cmd: "ktlint",      args: (f) => ["--format", f] } },
  { pattern: /\.dart$/,                             formatter: { cmd: "dart",        args: (f) => ["format", f] } },
];

export async function runHook(): Promise<void> {
  const event = await readHookEvent();
  const file = event.tool_input?.file_path;
  if (!file || typeof file !== "string") return;
  if (!(await Bun.file(file).exists())) return;

  for (const { pattern, formatter, alt } of TABLE) {
    if (!pattern.test(file)) continue;
    const path = await which(formatter.cmd);
    if (path) {
      await run([formatter.cmd, ...formatter.args(file)]);
      return;
    }
    if (alt && (await which(alt.cmd))) {
      await run([alt.cmd, ...alt.args(file)]);
      return;
    }
    // Neither formatter installed — fail-open.
    return;
  }
}
