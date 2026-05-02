import { Command, Option } from "commander";

export function createFlagsCommand(): Command {
  const command = new Command("flags");
  command.description("Generated flags commands.");

  const listCommand = command.command("list");
  listCommand.description("flags list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for flags.list is not wired yet.");
  });

  const setCommand = command.command("set");
  setCommand.description("flags set");
  setCommand.option("--json", "Emit JSON output");
  setCommand.option("--enabled", "enabled");
  setCommand.addOption(new Option("--flag <choice>", "flag").choices([]));
  setCommand.option("--org-id <string>", "org-id");
  setCommand.option("--user-id <string>", "user-id");
  setCommand.action(async () => {
    throw new Error("Generated tRPC invocation for flags.set is not wired yet.");
  });

  return command;
}
