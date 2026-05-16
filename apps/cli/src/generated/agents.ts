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
      throw new Error("Generated tRPC invocation for agents.getProfile requires an explicit surface adapter.");
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
      throw new Error("Generated tRPC invocation for agents.listProfiles requires an explicit surface adapter.");
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

  const testProfileCommand = command.command("test-profile");
  testProfileCommand.description("agents testProfile");
  testProfileCommand.option("--json", "Emit JSON output");
  testProfileCommand.option("--name <string>", "name");
  testProfileCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for agents.testProfile requires an explicit surface adapter.");
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
