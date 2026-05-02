import { Command, Option } from "commander";

export function createDbCommand(): Command {
  const command = new Command("db");
  command.description("Generated db commands.");

  const pingCommand = command.command("ping");
  pingCommand.description("db ping");
  pingCommand.option("--json", "Emit JSON output");
  pingCommand.action(async () => {
    throw new Error("Generated tRPC invocation for db.ping is not wired yet.");
  });

  return command;
}
