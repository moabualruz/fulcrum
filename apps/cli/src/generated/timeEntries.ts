import { Command, Option } from "commander";

export function createTimeEntriesCommand(): Command {
  const command = new Command("timeEntries");
  command.description("Generated timeEntries commands.");

  const deleteCommand = command.command("delete");
  deleteCommand.description("timeEntries delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for timeEntries.delete requires an explicit surface adapter.");
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
  listCommand.description("timeEntries list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--limit <number>", "limit", Number.parseFloat);
  listCommand.option("--task-id <string>", "task-id");
  listCommand.option("--user-id <string>", "user-id");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for timeEntries.list requires an explicit surface adapter.");
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

  const logCommand = command.command("log");
  logCommand.description("timeEntries log");
  logCommand.option("--json", "Emit JSON output");
  logCommand.option("--description <string>", "description");
  logCommand.option("--duration-minutes <number>", "duration-minutes", Number.parseFloat);
  logCommand.option("--task-id <string>", "task-id");
  logCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for timeEntries.log requires an explicit surface adapter.");
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

  const summaryCommand = command.command("summary");
  summaryCommand.description("timeEntries summary");
  summaryCommand.option("--json", "Emit JSON output");
  summaryCommand.option("--task-id <string>", "task-id");
  summaryCommand.option("--user-id <string>", "user-id");
  summaryCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for timeEntries.summary requires an explicit surface adapter.");
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
