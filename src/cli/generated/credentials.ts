import { Command, Option } from "commander";

export function createCredentialsCommand(): Command {
  const command = new Command("credentials");
  command.description("Generated credentials commands.");

  const archiveCommand = command.command("archive");
  archiveCommand.description("credentials archive");
  archiveCommand.option("--json", "Emit JSON output");
  archiveCommand.option("--name <string>", "name");
  archiveCommand.option("--user-id <string>", "user-id");
  archiveCommand.action(async () => {
    throw new Error("Generated tRPC invocation for credentials.archive is not wired yet.");
  });

  const getCommand = command.command("get");
  getCommand.description("credentials get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--name <string>", "name");
  getCommand.option("--user-id <string>", "user-id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for credentials.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("credentials list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--include-archived", "include-archived");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for credentials.list is not wired yet.");
  });

  const removeCommand = command.command("remove");
  removeCommand.description("credentials remove");
  removeCommand.option("--json", "Emit JSON output");
  removeCommand.option("--name <string>", "name");
  removeCommand.option("--user-id <string>", "user-id");
  removeCommand.action(async () => {
    throw new Error("Generated tRPC invocation for credentials.remove is not wired yet.");
  });

  const rotateCommand = command.command("rotate");
  rotateCommand.description("credentials rotate");
  rotateCommand.option("--json", "Emit JSON output");
  rotateCommand.option("--name <string>", "name");
  rotateCommand.option("--new-value <string>", "new-value");
  rotateCommand.option("--user-id <string>", "user-id");
  rotateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for credentials.rotate is not wired yet.");
  });

  const setCommand = command.command("set");
  setCommand.description("credentials set");
  setCommand.option("--json", "Emit JSON output");
  setCommand.option("--name <string>", "name");
  setCommand.option("--value <string>", "value");
  setCommand.action(async () => {
    throw new Error("Generated tRPC invocation for credentials.set is not wired yet.");
  });

  return command;
}
