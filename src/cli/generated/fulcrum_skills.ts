import { Command, Option } from "commander";

export function createFulcrumSkillsCommand(): Command {
  const command = new Command("fulcrum_skills");
  command.description("Generated fulcrum_skills commands.");

  const installCommand = command.command("install");
  installCommand.description("fulcrum_skills install");
  installCommand.option("--json", "Emit JSON output");
  installCommand.action(async () => {
    throw new Error("Generated tRPC invocation for fulcrum_skills.install is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("fulcrum_skills list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for fulcrum_skills.list is not wired yet.");
  });

  const resolveConflictCommand = command.command("resolve-conflict");
  resolveConflictCommand.description("fulcrum_skills resolveConflict");
  resolveConflictCommand.option("--json", "Emit JSON output");
  resolveConflictCommand.action(async () => {
    throw new Error("Generated tRPC invocation for fulcrum_skills.resolveConflict is not wired yet.");
  });

  const syncCommand = command.command("sync");
  syncCommand.description("fulcrum_skills sync");
  syncCommand.option("--json", "Emit JSON output");
  syncCommand.action(async () => {
    throw new Error("Generated tRPC invocation for fulcrum_skills.sync is not wired yet.");
  });

  const uninstallCommand = command.command("uninstall");
  uninstallCommand.description("fulcrum_skills uninstall");
  uninstallCommand.option("--json", "Emit JSON output");
  uninstallCommand.option("--id <string>", "id");
  uninstallCommand.action(async () => {
    throw new Error("Generated tRPC invocation for fulcrum_skills.uninstall is not wired yet.");
  });

  const upgradeCommand = command.command("upgrade");
  upgradeCommand.description("fulcrum_skills upgrade");
  upgradeCommand.option("--json", "Emit JSON output");
  upgradeCommand.action(async () => {
    throw new Error("Generated tRPC invocation for fulcrum_skills.upgrade is not wired yet.");
  });

  return command;
}
