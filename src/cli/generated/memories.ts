import { Command, Option } from "commander";

export function createMemoriesCommand(): Command {
  const command = new Command("memories");
  command.description("Generated memories commands.");

  const createCommand = command.command("create");
  createCommand.description("memories create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async () => {
    throw new Error("Generated tRPC invocation for memories.create is not wired yet.");
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("memories delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for memories.delete is not wired yet.");
  });

  const getCommand = command.command("get");
  getCommand.description("memories get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for memories.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("memories list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for memories.list is not wired yet.");
  });

  const promoteCommand = command.command("promote");
  promoteCommand.description("memories promote");
  promoteCommand.option("--json", "Emit JSON output");
  promoteCommand.option("--id <string>", "id");
  promoteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for memories.promote is not wired yet.");
  });

  const updateCommand = command.command("update");
  updateCommand.description("memories update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for memories.update is not wired yet.");
  });

  return command;
}
