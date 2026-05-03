import { Command, Option } from "commander";

export function createDataImportCommand(): Command {
  const command = new Command("dataImport");
  command.description("Generated dataImport commands.");

  const preflightCommand = command.command("preflight");
  preflightCommand.description("dataImport preflight");
  preflightCommand.option("--json", "Emit JSON output");
  preflightCommand.option("--path <string>", "path");
  preflightCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for dataImport.preflight is not wired yet.");
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

  const runCommand = command.command("run");
  runCommand.description("dataImport run");
  runCommand.option("--json", "Emit JSON output");
  runCommand.option("--dry-run", "dry-run");
  runCommand.option("--import-id <string>", "import-id");
  runCommand.addOption(new Option("--on-conflict <choice>", "on-conflict").choices(["skip","update","error"]));
  runCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for dataImport.run is not wired yet.");
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
