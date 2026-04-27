// Agent-neutral audit log — append `ISO-8601\tcommand\texit_code` to
// ~/.fulcrum/state/<project>/shell-commands.log. Write-only, never blocks.

import { readHookEvent, stateDir } from "../utils/io.ts";

export async function runHook(): Promise<void> {
  const event = await readHookEvent();
  const cmd = event.tool_input?.command;
  if (typeof cmd !== "string" || !cmd) return;

  const exit = event.tool_response?.exit_code ?? event.tool_response?.returncode ?? 0;
  const dir = await stateDir();
  const log = `${dir}/shell-commands.log`;
  const line = `${new Date().toISOString()}\t${cmd.replace(/\t/g, " ")}\t${exit}\n`;

  // Append by reading + writing (Bun.file doesn't have append yet); cheap for small logs.
  // For robustness, use Bun's file writer with append flag via the Node fs adapter.
  const { appendFile } = await import("node:fs/promises");
  await appendFile(log, line);
}
