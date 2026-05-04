import { Command, Option } from "commander";

export function createHealthCommand(): Command {
  const command = new Command("health");
  command.description("Generated health commands.");

  const pingCommand = command.command("ping");
  pingCommand.description("health ping");
  pingCommand.option("--json", "Emit JSON output");
  pingCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for health.ping is not wired yet.");
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
