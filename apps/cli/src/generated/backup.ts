import { Command, Option } from "commander";

export function createBackupCommand(): Command {
  const command = new Command("backup");
  command.description("Generated backup commands.");

  const createCommand = command.command("create");
  createCommand.description("backup create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for backup.create requires an explicit surface adapter.");
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

  const restoreCommand = command.command("restore");
  restoreCommand.description("backup restore");
  restoreCommand.option("--json", "Emit JSON output");
  restoreCommand.option("--dump <string>", "dump");
  restoreCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for backup.restore requires an explicit surface adapter.");
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
