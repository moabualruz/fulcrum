import { Command, Option } from "commander";

export function createHealthCommand(): Command {
  const command = new Command("health");
  command.description("Generated health commands.");

  const pingCommand = command.command("ping");
  pingCommand.description("health ping");
  pingCommand.option("--json", "Emit JSON output");
  pingCommand.action(async () => {
    throw new Error("Generated tRPC invocation for health.ping is not wired yet.");
  });

  return command;
}
