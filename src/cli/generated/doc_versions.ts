import { Command, Option } from "commander";

export function createDocVersionsCommand(): Command {
  const command = new Command("doc_versions");
  command.description("Generated doc_versions commands.");

  const getCommand = command.command("get");
  getCommand.description("doc_versions get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for doc_versions.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("doc_versions list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for doc_versions.list is not wired yet.");
  });

  const restoreCommand = command.command("restore");
  restoreCommand.description("doc_versions restore");
  restoreCommand.option("--json", "Emit JSON output");
  restoreCommand.option("--id <string>", "id");
  restoreCommand.action(async () => {
    throw new Error("Generated tRPC invocation for doc_versions.restore is not wired yet.");
  });

  return command;
}
