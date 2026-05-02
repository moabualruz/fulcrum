import { Command, Option } from "commander";

export function createRoutingCommand(): Command {
  const command = new Command("routing");
  command.description("Generated routing commands.");

  const createCommand = command.command("create");
  createCommand.description("routing create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async () => {
    throw new Error("Generated tRPC invocation for routing.create is not wired yet.");
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("routing delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for routing.delete is not wired yet.");
  });

  const dryRunCommand = command.command("dry-run");
  dryRunCommand.description("routing dryRun");
  dryRunCommand.option("--json", "Emit JSON output");
  dryRunCommand.action(async () => {
    throw new Error("Generated tRPC invocation for routing.dryRun is not wired yet.");
  });

  const getCommand = command.command("get");
  getCommand.description("routing get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for routing.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("routing list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for routing.list is not wired yet.");
  });

  const testCommand = command.command("test");
  testCommand.description("routing test");
  testCommand.option("--json", "Emit JSON output");
  testCommand.action(async () => {
    throw new Error("Generated tRPC invocation for routing.test is not wired yet.");
  });

  const updateCommand = command.command("update");
  updateCommand.description("routing update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for routing.update is not wired yet.");
  });

  return command;
}
