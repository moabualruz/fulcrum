// Package-manager policy — refuse npm/yarn when the repo declares pnpm or bun.

import { readHookEvent } from "@platform-core/application/runtime-support/hook-event-io.ts";
import { exists } from "@platform-core/application/runtime-support/process-runner.ts";

function deny(reason: string): never {
  process.stderr.write(`pm-policy: ${reason}\n`);
  process.exit(2);
}

export async function runHook(): Promise<void> {
  const event = await readHookEvent();
  const cmd = event.tool_input?.command;
  if (typeof cmd !== "string" || !cmd) return;
  const dir = process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();

  const hasPnpm = await exists(`${dir}/pnpm-lock.yaml`);
  const hasBun  = (await exists(`${dir}/bun.lockb`)) || (await exists(`${dir}/bun.lock`));
  const hasYarn = await exists(`${dir}/yarn.lock`);

  // Token boundary so 'mynpm' / 'corepack-npm' don't false-positive.
  const tok = (s: string) => new RegExp(`(^|\\s)${s}(\\s|$)`).test(cmd);

  if (hasPnpm) {
    if (tok("npm"))  deny("this repo uses pnpm — replace 'npm' with 'pnpm'");
    if (tok("yarn")) deny("this repo uses pnpm — replace 'yarn' with 'pnpm'");
  }
  if (hasBun) {
    if (tok("npm"))  deny("this repo uses bun — replace 'npm' with 'bun'");
    if (tok("yarn")) deny("this repo uses bun — replace 'yarn' with 'bun'");
  }
  if (hasYarn && !hasPnpm) {
    if (tok("npm"))  deny("this repo uses yarn — replace 'npm' with 'yarn'");
  }
}
