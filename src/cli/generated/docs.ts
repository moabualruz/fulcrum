import { Command, Option } from "commander";

export function createDocsCommand(): Command {
  const command = new Command("docs");
  command.description("Generated docs commands.");

  const createCommand = command.command("create");
  createCommand.description("docs create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async () => {
    throw new Error("Generated tRPC invocation for docs.create is not wired yet.");
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("docs delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for docs.delete is not wired yet.");
  });

  const getCommand = command.command("get");
  getCommand.description("docs get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for docs.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("docs list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for docs.list is not wired yet.");
  });

  const moveCommand = command.command("move");
  moveCommand.description("docs move");
  moveCommand.option("--json", "Emit JSON output");
  moveCommand.action(async () => {
    throw new Error("Generated tRPC invocation for docs.move is not wired yet.");
  });

  const reorderCommand = command.command("reorder");
  reorderCommand.description("docs reorder");
  reorderCommand.option("--json", "Emit JSON output");
  reorderCommand.action(async () => {
    throw new Error("Generated tRPC invocation for docs.reorder is not wired yet.");
  });

  const templatesListCommand = command.command("templates list");
  templatesListCommand.description("docs templates list");
  templatesListCommand.option("--json", "Emit JSON output");
  templatesListCommand.option("--project-id <string>", "project-id");
  templatesListCommand.action(async () => {
    throw new Error("Generated tRPC invocation for docs.templates.list is not wired yet.");
  });

  const templatesResolveCommand = command.command("templates resolve");
  templatesResolveCommand.description("docs templates resolve");
  templatesResolveCommand.option("--json", "Emit JSON output");
  templatesResolveCommand.addOption(new Option("--doc-type <choice>", "doc-type").choices([]));
  templatesResolveCommand.option("--project-id <string>", "project-id");
  templatesResolveCommand.action(async () => {
    throw new Error("Generated tRPC invocation for docs.templates.resolve is not wired yet.");
  });

  const updateCommand = command.command("update");
  updateCommand.description("docs update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for docs.update is not wired yet.");
  });

  return command;
}
