import { Command, Option } from "commander";

import { createDataPortabilityApiCallerFromEnv } from "@integration-hub/interface/http/data-portability-api-client.ts";

export function createDataImportCommand(): Command {
  const command = new Command("dataImport");
  command.description("Generated dataImport commands.");

  const preflightCommand = command.command("preflight");
  preflightCommand.description("dataImport preflight");
  preflightCommand.option("--json", "Emit JSON output");
  preflightCommand.option("--path <string>", "path");
  preflightCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await dataPortabilityClient().dataImport.preflight({ path: requiredOption(options, "path") })
    );
  });

  const runCommand = command.command("run");
  runCommand.description("dataImport run");
  runCommand.option("--json", "Emit JSON output");
  runCommand.option("--dry-run", "dry-run");
  runCommand.option("--import-id <string>", "import-id");
  runCommand.addOption(new Option("--on-conflict <choice>", "on-conflict").choices(["skip","update","error"]));
  runCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await dataPortabilityClient().dataImport.run({
        dryRun: options.dryRun,
        importId: requiredOption(options, "importId"),
        onConflict: options.onConflict,
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
