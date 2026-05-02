import { Command, Option } from "commander";

export function createRepoCommitsCommand(): Command {
  const command = new Command("repo_commits");
  command.description("Generated repo_commits commands.");

  const getCommand = command.command("get");
  getCommand.description("repo_commits get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for repo_commits.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("repo_commits list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for repo_commits.list is not wired yet.");
  });

  return command;
}
