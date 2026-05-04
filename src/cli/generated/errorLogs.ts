import { Command, Option } from "commander";

export function createErrorLogsCommand(): Command {
  const command = new Command("errorLogs");
  command.description("Generated errorLogs commands.");

  const clearCommand = command.command("clear");
  clearCommand.description("errorLogs clear");
  clearCommand.option("--json", "Emit JSON output");
  clearCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for errorLogs.clear is not wired yet.");
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

  const getCommand = command.command("get");
  getCommand.description("errorLogs get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for errorLogs.get is not wired yet.");
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

  const listCommand = command.command("list");
  listCommand.description("errorLogs list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--limit <number>", "limit", Number.parseFloat);
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for errorLogs.list is not wired yet.");
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
