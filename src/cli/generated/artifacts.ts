import { Command, Option } from "commander";

export function createArtifactsCommand(): Command {
  const command = new Command("artifacts");
  command.description("Generated artifacts commands.");

  const deleteCommand = command.command("delete");
  deleteCommand.description("artifacts delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for artifacts.delete is not wired yet.");
  });

  const downloadCommand = command.command("download");
  downloadCommand.description("artifacts download");
  downloadCommand.option("--json", "Emit JSON output");
  downloadCommand.option("--id <string>", "id");
  downloadCommand.action(async () => {
    throw new Error("Generated tRPC invocation for artifacts.download is not wired yet.");
  });

  const getCommand = command.command("get");
  getCommand.description("artifacts get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for artifacts.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("artifacts list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for artifacts.list is not wired yet.");
  });

  return command;
}
