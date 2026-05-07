import { Command, Option } from "commander";

export function createAuthCommand(): Command {
  const command = new Command("auth");
  command.description("Generated auth commands.");

  const acceptInviteCommand = command.command("accept-invite");
  acceptInviteCommand.description("auth acceptInvite");
  acceptInviteCommand.option("--json", "Emit JSON output");
  acceptInviteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for auth.acceptInvite requires an explicit surface adapter.");
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

  const inviteCommand = command.command("invite");
  inviteCommand.description("auth invite");
  inviteCommand.option("--json", "Emit JSON output");
  inviteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for auth.invite requires an explicit surface adapter.");
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

  const whoamiCommand = command.command("whoami");
  whoamiCommand.description("auth whoami");
  whoamiCommand.option("--json", "Emit JSON output");
  whoamiCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for auth.whoami requires an explicit surface adapter.");
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
