import { Command, Option } from "commander";

export function createRepoCommitsCommand(): Command {
  const command = new Command("repo_commits");
  command.description("Generated repo_commits commands.");

  const getCommand = command.command("get");
  getCommand.description("repo_commits get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for repo_commits.get requires an explicit surface adapter.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const listCommand = command.command("list");
  listCommand.description("repo_commits list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for repo_commits.list requires an explicit surface adapter.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  return command;
}
