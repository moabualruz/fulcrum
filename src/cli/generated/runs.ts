import { Command, Option } from "commander";

export function createRunsCommand(): Command {
  const command = new Command("runs");
  command.description("Generated runs commands.");

  const cancelCommand = command.command("cancel");
  cancelCommand.description("runs cancel");
  cancelCommand.option("--json", "Emit JSON output");
  cancelCommand.option("--id <string>", "id");
  cancelCommand.action(async () => {
    throw new Error("Generated tRPC invocation for runs.cancel is not wired yet.");
  });

  const createCommand = command.command("create");
  createCommand.description("runs create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async () => {
    throw new Error("Generated tRPC invocation for runs.create is not wired yet.");
  });

  const getCommand = command.command("get");
  getCommand.description("runs get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for runs.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("runs list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for runs.list is not wired yet.");
  });

  const retryCommand = command.command("retry");
  retryCommand.description("runs retry");
  retryCommand.option("--json", "Emit JSON output");
  retryCommand.option("--id <string>", "id");
  retryCommand.action(async () => {
    throw new Error("Generated tRPC invocation for runs.retry is not wired yet.");
  });

  return command;
}
