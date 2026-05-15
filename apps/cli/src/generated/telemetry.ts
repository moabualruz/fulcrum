import { Command } from "commander";

import { createTelemetryApiCallerFromEnv } from "@platform-core/interface/http/telemetry-api-client.ts";

export function createTelemetryCommand(): Command {
  const command = new Command("telemetry");
  command.description("Generated telemetry commands.");

  const optInCommand = command.command("opt-in");
  optInCommand.description("telemetry optIn");
  optInCommand.option("--json", "Emit JSON output");
  optInCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await telemetryClient().optIn());
  });

  const optOutCommand = command.command("opt-out");
  optOutCommand.description("telemetry optOut");
  optOutCommand.option("--json", "Emit JSON output");
  optOutCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await telemetryClient().optOut());
  });

  const purgeCommand = command.command("purge");
  purgeCommand.description("telemetry purge");
  purgeCommand.option("--json", "Emit JSON output");
  purgeCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await telemetryClient().purge());
  });

  const statusCommand = command.command("status");
  statusCommand.description("telemetry status");
  statusCommand.option("--json", "Emit JSON output");
  statusCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await telemetryClient().status());
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

function telemetryClient() {
  const caller = createTelemetryApiCallerFromEnv();
  if (!caller) {
    throw new Error("Telemetry API caller is not configured. Set FULCRUM_SERVER_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.");
  }
  return caller.telemetry;
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) console.log(JSON.stringify(result));
  else if (typeof result === "string") console.log(result);
  else console.log(JSON.stringify(result));
}
