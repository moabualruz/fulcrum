import { Command, Option } from "commander";

export function createOrgsCommand(): Command {
  const command = new Command("orgs");
  command.description("Generated orgs commands.");

  const getCommand = command.command("get");
  getCommand.description("orgs get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for orgs.get is not wired yet.");
  });

  const membersListCommand = command.command("members list");
  membersListCommand.description("orgs members list");
  membersListCommand.option("--json", "Emit JSON output");
  membersListCommand.action(async () => {
    throw new Error("Generated tRPC invocation for orgs.members.list is not wired yet.");
  });

  const membersRemoveCommand = command.command("members remove");
  membersRemoveCommand.description("orgs members remove");
  membersRemoveCommand.option("--json", "Emit JSON output");
  membersRemoveCommand.option("--user-id <string>", "User to remove from the organisation.");
  membersRemoveCommand.action(async () => {
    throw new Error("Generated tRPC invocation for orgs.members.remove is not wired yet.");
  });

  const membersUpdateRoleCommand = command.command("members update-role");
  membersUpdateRoleCommand.description("orgs members updateRole");
  membersUpdateRoleCommand.option("--json", "Emit JSON output");
  membersUpdateRoleCommand.addOption(new Option("--role <choice>", "New role to assign to the member.").choices(["owner","admin","member","guest"]));
  membersUpdateRoleCommand.option("--user-id <string>", "User whose role should be updated.");
  membersUpdateRoleCommand.action(async () => {
    throw new Error("Generated tRPC invocation for orgs.members.updateRole is not wired yet.");
  });

  const updateCommand = command.command("update");
  updateCommand.description("orgs update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.option("--name <string>", "New human-readable organisation name.");
  updateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for orgs.update is not wired yet.");
  });

  return command;
}
