import { Command } from "commander";
import { createWebhookApiCallerFromEnv } from "@integration-hub/interface/http/webhook-api-client.ts";

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
    await runGeneratedAction(options, async () =>
      await webhookClient().create(compact({
        name: requiredOption(options, "name"),
        url: requiredOption(options, "url"),
        secret: options.secret,
        enabled: options.enabled === true ? true : undefined,
      }))
    );
  });

  const deleteCommand = command.command("delete");
  deleteCommand.description("webhooks delete");
  deleteCommand.option("--json", "Emit JSON output");
  deleteCommand.option("--id <string>", "id");
  deleteCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await webhookClient().delete({ id: requiredOption(options, "id") })
    );
  });

  const deliveriesCommand = command.command("deliveries");
  deliveriesCommand.description("Generated webhook delivery commands.");

  const deliveriesGetCommand = deliveriesCommand.command("get");
  deliveriesGetCommand.description("webhooks deliveries get");
  deliveriesGetCommand.option("--json", "Emit JSON output");
  deliveriesGetCommand.option("--id <string>", "id");
  deliveriesGetCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await webhookClient().deliveries.get({ id: requiredOption(options, "id") })
    );
  });

  const deliveriesListCommand = deliveriesCommand.command("list");
  deliveriesListCommand.description("webhooks deliveries list");
  deliveriesListCommand.option("--json", "Emit JSON output");
  deliveriesListCommand.option("--limit <number>", "Maximum number of deliveries to return (default 50).", Number.parseFloat);
  deliveriesListCommand.option("--webhook-id <string>", "Webhook whose delivery log to retrieve.");
  deliveriesListCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await webhookClient().deliveries.list({
        webhookId: requiredOption(options, "webhookId"),
        limit: numberOption(options, "limit"),
      })
    );
  });

  const getCommand = command.command("get");
  getCommand.description("webhooks get");
  getCommand.option("--json", "Emit JSON output");
  getCommand.option("--id <string>", "id");
  getCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await webhookClient().get({ id: requiredOption(options, "id") })
    );
  });

  const listCommand = command.command("list");
  listCommand.description("webhooks list");
  listCommand.option("--json", "Emit JSON output");
  listCommand.option("--include-disabled", "Include disabled webhooks.");
  listCommand.action(async (options) => {
    await runGeneratedAction(options, async () =>
      await webhookClient().list({ includeDisabled: options.includeDisabled === true ? true : undefined })
    );
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
    await runGeneratedAction(options, async () =>
      await webhookClient().update({
        id: requiredOption(options, "id"),
        ...compact({
          name: options.name,
          url: options.url,
          secret: options.secret,
          enabled: options.enabled === true ? true : undefined,
        }),
      })
    );
  });

  return command;
}

async function runGeneratedAction(
  options: { json?: boolean },
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    printGeneratedResult(await action(), options);
  } catch (error) {
    if (options.json === true) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ error: { code: "INTERNAL_ERROR", message } }));
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

function webhookClient() {
  const caller = createWebhookApiCallerFromEnv();
  if (!caller) {
    throw new Error("Webhook API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL and FULCRUM_ORG_ID.");
  }
  return caller.webhooks;
}

function printGeneratedResult(result: unknown, options: { json?: boolean }): void {
  if (options.json === true) {
    console.log(JSON.stringify(result));
    return;
  }
  if (typeof result === "object") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(result);
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}

function requiredOption(options: Record<string, unknown>, key: string): string {
  const value = options[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${key} is required.`);
}

function numberOption(options: Record<string, unknown>, key: string): number | undefined {
  const value = options[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
