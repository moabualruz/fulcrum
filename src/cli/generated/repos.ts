import { Command, Option } from "commander";

export function createReposCommand(): Command {
  const command = new Command("repos");
  command.description("Generated repos commands.");

  const getCommand = command.command("get");
  getCommand.description("repos get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for repos.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("repos list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for repos.list is not wired yet.");
  });

  const registerCommand = command.command("register");
  registerCommand.description("repos register");
  registerCommand.option("--json", "Emit JSON output");
  registerCommand.action(async () => {
    throw new Error("Generated tRPC invocation for repos.register is not wired yet.");
  });

  const syncCommand = command.command("sync");
  syncCommand.description("repos sync");
  syncCommand.option("--json", "Emit JSON output");
  syncCommand.option("--id <string>", "id");
  syncCommand.action(async () => {
    throw new Error("Generated tRPC invocation for repos.sync is not wired yet.");
  });

  const unregisterCommand = command.command("unregister");
  unregisterCommand.description("repos unregister");
  unregisterCommand.option("--json", "Emit JSON output");
  unregisterCommand.option("--id <string>", "id");
  unregisterCommand.action(async () => {
    throw new Error("Generated tRPC invocation for repos.unregister is not wired yet.");
  });

  return command;
}
