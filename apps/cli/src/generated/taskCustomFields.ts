import { Command, Option } from "commander";

export function createTaskCustomFieldsCommand(): Command {
  const command = new Command("taskCustomFields");
  command.description("Generated taskCustomFields commands.");

  const clearCommand = command.command("clear");
  clearCommand.description("taskCustomFields clear");
  clearCommand.option("--json", "Emit JSON output");
  clearCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for taskCustomFields.clear requires an explicit surface adapter.");
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

  const setCommand = command.command("set");
  setCommand.description("taskCustomFields set");
  setCommand.option("--json", "Emit JSON output");
  setCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for taskCustomFields.set requires an explicit surface adapter.");
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
