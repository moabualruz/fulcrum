import { Command, Option } from "commander";

export function createAuthCommand(): Command {
  const command = new Command("auth");
  command.description("Generated auth commands.");

  const acceptInviteCommand = command.command("accept-invite");
  acceptInviteCommand.description("auth acceptInvite");
  acceptInviteCommand.option("--json", "Emit JSON output");
  acceptInviteCommand.option("--token <string>", "Plaintext token from the invitation email.");
  acceptInviteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for auth.acceptInvite is not wired yet.");
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
  inviteCommand.option("--email <string>", "Email address of the person to invite.");
  inviteCommand.addOption(new Option("--role <choice>", "Role to assign to the invited user.").choices(["owner","admin","member","guest"]));
  inviteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for auth.invite is not wired yet.");
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
      throw new Error("Generated tRPC invocation for auth.whoami is not wired yet.");
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
