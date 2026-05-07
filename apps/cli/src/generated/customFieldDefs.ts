import { Command, Option } from "commander";

export function createCustomFieldDefsCommand(): Command {
  const command = new Command("customFieldDefs");
  command.description("Generated customFieldDefs commands.");

  const listCommand = command.command("list");
  listCommand.description("customFieldDefs list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for customFieldDefs.list requires an explicit surface adapter.");
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
