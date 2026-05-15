import { Command } from "commander";

import { createErrorLogApiCallerFromEnv } from "@platform-core/interface/http/error-log-api-client.ts";

export function createErrorLogsCommand(): Command {
  const command = new Command("errorLogs");
  command.description("Generated errorLogs commands.");

  const clearCommand = command.command("clear");
  clearCommand.description("errorLogs clear");
  clearCommand.option("--json", "Emit JSON output");
  clearCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await errorLogsClient().clear());
  });

  const getCommand = command.command("get");
  getCommand.description("errorLogs get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await errorLogsClient().get({ id: requiredOption(options, "id") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("errorLogs list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--limit <number>", "limit", Number.parseFloat);
  listCommand.option("--since <date>", "Only logs on or after this ISO date.");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await errorLogsClient().list({
        limit: options.limit,
        since: options.since,
      })
    );
  });

  return command;
}

async function runGeneratedAction(
  options: { json?: boolean },
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    printGeneratedResult(await action(), options);
  } catch (error) {
    if (options.json === true) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

function errorLogsClient() {
  const caller = createErrorLogApiCallerFromEnv();
  if (!caller) {
    throw new Error("Error log API caller is not configured. Set FULCRUM_SERVER_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.");
  }
  return caller.errorLogs;
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) console.log(JSON.stringify(result));
  else if (typeof result === "string") console.log(result);
  else console.log(JSON.stringify(result));
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}
