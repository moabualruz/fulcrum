import { Command, Option } from "commander";

export function createInvitationsCommand(): Command {
  const command = new Command("invitations");
  command.description("Generated invitations commands.");

  const createCommand = command.command("create");
  createCommand.description("invitations create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async () => {
    throw new Error("Generated tRPC invocation for invitations.create is not wired yet.");
  });

  const getCommand = command.command("get");
  getCommand.description("invitations get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for invitations.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("invitations list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for invitations.list is not wired yet.");
  });

  const revokeCommand = command.command("revoke");
  revokeCommand.description("invitations revoke");
  revokeCommand.option("--json", "Emit JSON output");
  revokeCommand.option("--id <string>", "id");
  revokeCommand.action(async () => {
    throw new Error("Generated tRPC invocation for invitations.revoke is not wired yet.");
  });

  return command;
}
