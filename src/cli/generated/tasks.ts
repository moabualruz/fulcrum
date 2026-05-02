import { Command, Option } from "commander";

export function createTasksCommand(): Command {
  const command = new Command("tasks");
  command.description("Generated tasks commands.");

  const bulkCommand = command.command("bulk");
  bulkCommand.description("tasks bulk");
  bulkCommand.option("--json", "Emit JSON output");
  bulkCommand.action(async () => {
    throw new Error("Generated tRPC invocation for tasks.bulk is not wired yet.");
  });

  const claimCommand = command.command("claim");
  claimCommand.description("tasks claim");
  claimCommand.option("--json", "Emit JSON output");
  claimCommand.option("--id <string>", "id");
  claimCommand.action(async () => {
    throw new Error("Generated tRPC invocation for tasks.claim is not wired yet.");
  });

  const createCommand = command.command("create");
  createCommand.description("tasks create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async () => {
    throw new Error("Generated tRPC invocation for tasks.create is not wired yet.");
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("tasks delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for tasks.delete is not wired yet.");
  });

  const getCommand = command.command("get");
  getCommand.description("tasks get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for tasks.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("tasks list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for tasks.list is not wired yet.");
  });

  const moveCommand = command.command("move");
  moveCommand.description("tasks move");
  moveCommand.option("--json", "Emit JSON output");
  moveCommand.action(async () => {
    throw new Error("Generated tRPC invocation for tasks.move is not wired yet.");
  });

  const updateCommand = command.command("update");
  updateCommand.description("tasks update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for tasks.update is not wired yet.");
  });

  return command;
}
