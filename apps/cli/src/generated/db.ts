import { Command } from "commander";
import { defaultDatabaseStatus } from "@platform-core/interface/database-status.ts";

export function createDbCommand(): Command {
  const command = new Command("db");
  command.description("Generated db commands.");

  const pingCommand = command.command("ping");
  pingCommand.description("db ping");
  pingCommand.option("--json", "Emit JSON output");
  pingCommand.action(async (options) => {
    try {
      printGeneratedResult(defaultDatabaseStatus(), options);
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  return command;
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) {
    console.log(JSON.stringify(result));
    return;
  }
  if (typeof result === "object") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(result);
}
