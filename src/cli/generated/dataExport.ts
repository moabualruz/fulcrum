import { Command, Option } from "commander";

export function createDataExportCommand(): Command {
  const command = new Command("dataExport");
  command.description("Generated dataExport commands.");

  const createCommand = command.command("create");
  createCommand.description("dataExport create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--output-path <string>", "output-path");
  createCommand.option("--pretty", "pretty");
  createCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for dataExport.create is not wired yet.");
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
