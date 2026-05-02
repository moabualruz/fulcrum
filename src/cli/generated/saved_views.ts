import { Command, Option } from "commander";

export function createSavedViewsCommand(): Command {
  const command = new Command("saved_views");
  command.description("Generated saved_views commands.");

  const listCommand = command.command("list");
  listCommand.description("saved_views list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for saved_views.list is not wired yet.");
  });

  const getCommand = command.command("get");
  getCommand.description("saved_views get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for saved_views.get is not wired yet.");
  });

  const createCommand = command.command("create");
  createCommand.description("saved_views create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async () => {
    throw new Error("Generated tRPC invocation for saved_views.create is not wired yet.");
  });

  const updateCommand = command.command("update");
  updateCommand.description("saved_views update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for saved_views.update is not wired yet.");
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("saved_views delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for saved_views.delete is not wired yet.");
  });

  return command;
}
