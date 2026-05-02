import { Command, Option } from "commander";

export function createSprintsCommand(): Command {
  const command = new Command("sprints");
  command.description("Generated sprints commands.");

  const activateCommand = command.command("activate");
  activateCommand.description("sprints activate");
  activateCommand.option("--json", "Emit JSON output");
  activateCommand.option("--id <string>", "id");
  activateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for sprints.activate is not wired yet.");
  });

  const completeCommand = command.command("complete");
  completeCommand.description("sprints complete");
  completeCommand.option("--json", "Emit JSON output");
  completeCommand.option("--id <string>", "id");
  completeCommand.action(async () => {
    throw new Error("Generated tRPC invocation for sprints.complete is not wired yet.");
  });

  const createCommand = command.command("create");
  createCommand.description("sprints create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async () => {
    throw new Error("Generated tRPC invocation for sprints.create is not wired yet.");
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("sprints delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for sprints.delete is not wired yet.");
  });

  const getCommand = command.command("get");
  getCommand.description("sprints get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for sprints.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("sprints list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for sprints.list is not wired yet.");
  });

  const updateCommand = command.command("update");
  updateCommand.description("sprints update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for sprints.update is not wired yet.");
  });

  return command;
}
