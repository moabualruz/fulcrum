import { Command, Option } from "commander";

export function createWebhooksCommand(): Command {
  const command = new Command("webhooks");
  command.description("Generated webhooks commands.");

  const createCommand = command.command("create");
  createCommand.description("webhooks create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.action(async () => {
    throw new Error("Generated tRPC invocation for webhooks.create is not wired yet.");
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("webhooks delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async () => {
    throw new Error("Generated tRPC invocation for webhooks.delete is not wired yet.");
  });

  const deliveriesGetCommand = command.command("deliveries get");
  deliveriesGetCommand.description("webhooks deliveries get");
  deliveriesGetCommand.option("--json", "Emit JSON output");
  deliveriesGetCommand.option("--id <string>", "id");
  deliveriesGetCommand.action(async () => {
    throw new Error("Generated tRPC invocation for webhooks.deliveries.get is not wired yet.");
  });

  const deliveriesListCommand = command.command("deliveries list");
  deliveriesListCommand.description("webhooks deliveries list");
  deliveriesListCommand.option("--json", "Emit JSON output");
  deliveriesListCommand.action(async () => {
    throw new Error("Generated tRPC invocation for webhooks.deliveries.list is not wired yet.");
  });

  const getCommand = command.command("get");
  getCommand.description("webhooks get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async () => {
    throw new Error("Generated tRPC invocation for webhooks.get is not wired yet.");
  });

  const listCommand = command.command("list");
  listCommand.description("webhooks list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async () => {
    throw new Error("Generated tRPC invocation for webhooks.list is not wired yet.");
  });

  const updateCommand = command.command("update");
  updateCommand.description("webhooks update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.action(async () => {
    throw new Error("Generated tRPC invocation for webhooks.update is not wired yet.");
  });

  return command;
}
