// Agent-neutral audit log — append `ISO-8601\tcommand\texit_code` to
// ~/.fulcrum/state/<project>/shell-commands.log. Write-only, never blocks.

import { appendFile } from "node:fs/promises";
import { readHookEvent, stateDir } from "@platform-core/application/runtime-support/hook-event-io.ts";

export async function runHook(): Promise<void> {
  const event = await readHookEvent();
  const cmd = event.tool_input?.command;
  if (typeof cmd !== "string" || !cmd) return;

  const exit = event.tool_response?.exit_code ?? event.tool_response?.returncode ?? 0;
  const dir = await stateDir();
  const log = `${dir}/shell-commands.log`;
  const line = `${new Date().toISOString()}\t${cmd.replace(/\t/g, " ")}\t${exit}\n`;
  await appendFile(log, line);
}
