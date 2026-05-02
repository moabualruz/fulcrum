import { Command, Option } from "commander";

export function createDocLinksCommand(): Command {
  const command = new Command("doc_links");
  command.description("Generated doc_links commands.");

  const createCommand = command.command("create");
  createCommand.description("doc_links create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async () => {
    throw new Error("Generated tRPC invocation for doc_links.create is not wired yet.");
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("doc_links delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for doc_links.delete is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("doc_links list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for doc_links.list is not wired yet.");
  });

  return command;
}
