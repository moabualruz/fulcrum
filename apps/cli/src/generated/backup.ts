import { Command } from "commander";

import { createDataPortabilityApiCallerFromEnv } from "@integration-hub/interface/http/data-portability-api-client.ts";

export function createBackupCommand(): Command {
  const command = new Command("backup");
  command.description("Generated backup commands.");

  const createCommand = command.command("create");
  createCommand.description("backup create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await dataPortabilityClient().backup.create());
  });

  const restoreCommand = command.command("restore");
  restoreCommand.description("backup restore");
  restoreCommand.option("--json", "Emit JSON output");
  restoreCommand.option("--dump <string>", "dump");
  restoreCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await dataPortabilityClient().backup.restore({ dump: requiredOption(options, "dump") })
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

function dataPortabilityClient() {
  const caller = createDataPortabilityApiCallerFromEnv();
  if (!caller) {
    throw new Error("Data portability API caller is not configured. Set FULCRUM_SERVER_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.");
  }
  return caller;
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
