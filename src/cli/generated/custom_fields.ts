import { Command, Option } from "commander";

export function createCustomFieldsCommand(): Command {
  const command = new Command("custom_fields");
  command.description("Generated custom_fields commands.");

  const createCommand = command.command("create");
  createCommand.description("custom_fields create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async () => {
    throw new Error("Generated tRPC invocation for custom_fields.create is not wired yet.");
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("custom_fields delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for custom_fields.delete is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("custom_fields list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for custom_fields.list is not wired yet.");
  });

  const reorderCommand = command.command("reorder");
  reorderCommand.description("custom_fields reorder");
  reorderCommand.option("--json", "Emit JSON output");
  reorderCommand.action(async () => {
    throw new Error("Generated tRPC invocation for custom_fields.reorder is not wired yet.");
  });

  const updateCommand = command.command("update");
  updateCommand.description("custom_fields update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for custom_fields.update is not wired yet.");
  });

  return command;
}
