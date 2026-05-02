import { Command, Option } from "commander";

export function createRepoBranchesCommand(): Command {
  const command = new Command("repo_branches");
  command.description("Generated repo_branches commands.");

  const getCommand = command.command("get");
  getCommand.description("repo_branches get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for repo_branches.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("repo_branches list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for repo_branches.list is not wired yet.");
  });

  return command;
}
