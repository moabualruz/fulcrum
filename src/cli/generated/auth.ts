import { Command, Option } from "commander";

export function createAuthCommand(): Command {
  const command = new Command("auth");
  command.description("Generated auth commands.");

  const acceptInviteCommand = command.command("accept-invite");
  acceptInviteCommand.description("auth acceptInvite");
  acceptInviteCommand.option("--json", "Emit JSON output");
  acceptInviteCommand.option("--token <string>", "token");
  acceptInviteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for auth.acceptInvite is not wired yet.");
  });

  const inviteCommand = command.command("invite");
  inviteCommand.description("auth invite");
  inviteCommand.option("--json", "Emit JSON output");
  inviteCommand.option("--email <string>", "email");
  inviteCommand.addOption(new Option("--role <choice>", "role").choices(["owner","admin","member","guest"]));
  inviteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for auth.invite is not wired yet.");
  });

  const whoamiCommand = command.command("whoami");
  whoamiCommand.description("auth whoami");
  whoamiCommand.option("--json", "Emit JSON output");
  whoamiCommand.action(async () => {
    throw new Error("Generated tRPC invocation for auth.whoami is not wired yet.");
  });

  return command;
}
