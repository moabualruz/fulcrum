import { Command, Option } from "commander";

export function createAgentsCommand(): Command {
  const command = new Command("agents");
  command.description("Generated agents commands.");

  const getProfileCommand = command.command("get-profile");
  getProfileCommand.description("agents getProfile");
  getProfileCommand.option("--json", "Emit JSON output");
  getProfileCommand.option("--name <string>", "name");
  getProfileCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for agents.getProfile is not wired yet.");
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

  const listProfilesCommand = command.command("list-profiles");
  listProfilesCommand.description("agents listProfiles");
  listProfilesCommand.option("--json", "Emit JSON output");
  listProfilesCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for agents.listProfiles is not wired yet.");
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
