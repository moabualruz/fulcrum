import { Command, Option } from "commander";

export function createWebhooksCommand(): Command {
  const command = new Command("webhooks");
  command.description("Generated webhooks commands.");

  const createCommand = command.command("create");
  createCommand.description("webhooks create");
  createCommand.option("--json", "Emit JSON output");
  createCommand.option("--enabled", "When false, no deliveries are attempted.");
  createCommand.option("--name <string>", "Human-readable webhook label (unique per org).");
  createCommand.option("--secret <string>", "HMAC signing secret (plain text; stored encrypted).");
  createCommand.option("--url <string>", "HTTPS destination for webhook events.");
  createCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for webhooks.create is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("webhooks delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for webhooks.delete is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const deliveriesGetCommand = command.command("deliveries get");
  deliveriesGetCommand.description("webhooks deliveries get");
  deliveriesGetCommand.option("--json", "Emit JSON output");
  deliveriesGetCommand.option("--id <string>", "id");
  deliveriesGetCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for webhooks.deliveries.get is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const deliveriesListCommand = command.command("deliveries list");
  deliveriesListCommand.description("webhooks deliveries list");
  deliveriesListCommand.option("--json", "Emit JSON output");
  deliveriesListCommand.option("--limit <number>", "Maximum number of deliveries to return (default 50).", Number.parseFloat);
  deliveriesListCommand.option("--webhook-id <string>", "Webhook whose delivery log to retrieve.");
  deliveriesListCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for webhooks.deliveries.list is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const getCommand = command.command("get");
  getCommand.description("webhooks get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for webhooks.get is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const listCommand = command.command("list");
  listCommand.description("webhooks list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for webhooks.list is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  const updateCommand = command.command("update");
  updateCommand.description("webhooks update");
  updateCommand.option("--json", "Emit JSON output");
  updateCommand.option("--enabled", "Enable or disable the webhook.");
  updateCommand.option("--id <string>", "Webhook to update.");
  updateCommand.option("--name <string>", "New human-readable label.");
  updateCommand.option("--secret <string>", "New HMAC signing secret (plain text; stored encrypted).");
  updateCommand.option("--url <string>", "New HTTPS destination.");
  updateCommand.action(async (options) => {
    try {
      throw new Error("Generated tRPC invocation for webhooks.update is not wired yet.");
    } catch (error) {
      if (options.json === true) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  });

  return command;
}
