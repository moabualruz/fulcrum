import { Command, Option } from "commander";

export function createMemoryCommand(): Command {
  const command = new Command("memory");
  command.description("Generated memory commands.");

  const createCommand = command.command("create");
  createCommand.description("memories create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async () => {
    throw new Error("Generated tRPC invocation for memory.create is not wired yet.");
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("memory delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for memory.delete is not wired yet.");
  });

  const getCommand = command.command("get");
  getCommand.description("memory get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for memory.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("memory list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for memory.list is not wired yet.");
  });

  const promoteCommand = command.command("promote");
  promoteCommand.description("memory promote");
  promoteCommand.option("--json", "Emit JSON output");
  promoteCommand.option("--id <string>", "id");
  promoteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for memory.promote is not wired yet.");
  });

  const updateCommand = command.command("update");
  updateCommand.description("memories update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for memory.update is not wired yet.");
  });

  return command;
}
