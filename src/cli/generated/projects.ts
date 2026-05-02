import { Command, Option } from "commander";

export function createProjectsCommand(): Command {
  const command = new Command("projects");
  command.description("Generated projects commands.");

  const createCommand = command.command("create");
  createCommand.description("projects create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async () => {
    throw new Error("Generated tRPC invocation for projects.create is not wired yet.");
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("projects delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for projects.delete is not wired yet.");
  });

  const getCommand = command.command("get");
  getCommand.description("projects get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for projects.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("projects list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for projects.list is not wired yet.");
  });

  const statsCommand = command.command("stats");
  statsCommand.description("projects stats");
  statsCommand.option("--json", "Emit JSON output");
  statsCommand.option("--id <string>", "id");
  statsCommand.action(async () => {
    throw new Error("Generated tRPC invocation for projects.stats is not wired yet.");
  });

  const updateCommand = command.command("update");
  updateCommand.description("projects update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for projects.update is not wired yet.");
  });

  return command;
}
