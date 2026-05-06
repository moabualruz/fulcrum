import { Command, Option } from "commander";

export function createDbCommand(): Command {
  const command = new Command("db");
  command.description("Generated db commands.");

  const pingCommand = command.command("ping");
  pingCommand.description("db ping");
  pingCommand.option("--json", "Emit JSON output");
  pingCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for db.ping requires an explicit surface adapter.");
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
