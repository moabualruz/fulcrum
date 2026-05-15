import { Command } from "commander";
import { createConnectorApiCallerFromEnv } from "@integration-hub/interface/http/connector-api-client.ts";

export function createConnectorsCommand(): Command {
  const command = new Command("connectors");
  command.description("Generated connectors commands.");

  const disableCommand = command.command("disable");
  disableCommand.description("connectors disable");
  disableCommand.option("--json", "Emit JSON output");
  disableCommand.option("--id <string>", "id");
  disableCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await connectorClient().disable({ id: requiredOption(options, "id") })
    );
  });

  const enableCommand = command.command("enable");
  enableCommand.description("connectors enable");
  enableCommand.option("--json", "Emit JSON output");
  enableCommand.option("--id <string>", "id");
  enableCommand.option("--config-json <json>", "Connector config as JSON");
  enableCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await connectorClient().enable({
        id: requiredOption(options, "id"),
        config: parseJsonOption(options.configJson),
      })
    );
  });

  const getCommand = command.command("get");
  getCommand.description("connectors get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await connectorClient().get({ id: requiredOption(options, "id") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("connectors list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () => await connectorClient().list());
  });

  const runsCommand = command.command("runs");
  runsCommand.description("connectors runs");

  const runsGetCommand = runsCommand.command("get");
  runsGetCommand.description("connectors runs get");
  runsGetCommand.option("--json", "Emit JSON output");
  runsGetCommand.option("--id <string>", "id");
  runsGetCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await connectorClient().runs.get({ id: requiredOption(options, "id") })
    );
  });

  const runsListCommand = runsCommand.command("list");
  runsListCommand.description("connectors runs list");
  runsListCommand.option("--json", "Emit JSON output");
  runsListCommand.option("--connector-id <string>", "connector-id");
  runsListCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await connectorClient().runs.list({ connectorId: options.connectorId })
    );
  });

  const syncCommand = command.command("sync");
  syncCommand.description("connectors sync");
  syncCommand.option("--json", "Emit JSON output");
  syncCommand.option("--id <string>", "id");
  syncCommand.option("--trigger <string>", "trigger");
  syncCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await connectorClient().sync({
        id: requiredOption(options, "id"),
        trigger: options.trigger,
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

function connectorClient() {
  const caller = createConnectorApiCallerFromEnv();
  if (!caller) {
    throw new Error("Connector API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return caller.connectors;
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

function parseJsonOption(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error("configJson must be valid JSON.");
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("configJson must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}
