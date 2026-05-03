import { Command, Option } from "commander";

export function createReportsCommand(): Command {
  const command = new Command("reports");
  command.description("Generated reports commands.");

  const burndownCommand = command.command("burndown");
  burndownCommand.description("reports burndown");
  burndownCommand.option("--json", "Emit JSON output");
  burndownCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for reports.burndown is not wired yet.");
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
