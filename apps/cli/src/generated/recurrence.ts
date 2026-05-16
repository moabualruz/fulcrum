import { Command, Option } from "commander";

export function createRecurrenceCommand(): Command {
  const command = new Command("recurrence");
  command.description("Generated recurrence commands.");

  const createCommand = command.command("create");
  createCommand.description("recurrence create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--cron-expression <string>", "cron-expression");
  createCommand.option("--include-subtasks", "include-subtasks");
  createCommand.option("--interval-days <number>", "interval-days", Number.parseFloat);
  createCommand.option("--max-occurrences <number>", "max-occurrences", Number.parseFloat);
  createCommand.option("--task-id <string>", "task-id");
  createCommand.option("--timezone <string>", "timezone");
  createCommand.addOption(new Option("--trigger-type <choice>", "trigger-type").choices(["schedule","on_complete"]));
  createCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for recurrence.create requires an explicit surface adapter.");
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

  const deleteCommand = command.command("delete");
  deleteCommand.description("recurrence delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--rule-id <string>", "rule-id");
  deleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for recurrence.delete requires an explicit surface adapter.");
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
  listCommand.description("recurrence list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--task-id <string>", "task-id");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for recurrence.list requires an explicit surface adapter.");
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
