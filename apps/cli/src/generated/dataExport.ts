import { Command } from "commander";

import { createDataPortabilityApiCallerFromEnv } from "@integration-hub/interface/http/data-portability-api-client.ts";

export function createDataExportCommand(): Command {
  const command = new Command("dataExport");
  command.description("Generated dataExport commands.");

  const createCommand = command.command("create");
  createCommand.description("dataExport create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--output-path <string>", "output-path");
  createCommand.option("--pretty", "pretty");
  createCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await dataPortabilityClient().dataExport.create({
        outputPath: options.outputPath,
        pretty: options.pretty,
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
