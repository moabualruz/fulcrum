import { Command, Option } from "commander";

export function createDocCommentsCommand(): Command {
  const command = new Command("doc_comments");
  command.description("Generated doc_comments commands.");

  const createCommand = command.command("create");
  createCommand.description("doc_comments create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async () => {
    throw new Error("Generated tRPC invocation for doc_comments.create is not wired yet.");
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("doc_comments delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for doc_comments.delete is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("doc_comments list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for doc_comments.list is not wired yet.");
  });

  const updateCommand = command.command("update");
  updateCommand.description("doc_comments update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for doc_comments.update is not wired yet.");
  });

  return command;
}
