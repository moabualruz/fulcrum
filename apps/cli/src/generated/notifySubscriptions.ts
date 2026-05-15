import { Command } from "commander";

import { createSubscriptionEventApiCallerFromEnv } from "@platform-core/interface/http/subscription-event-api-client.ts";

export function createNotifySubscriptionsCommand(): Command {
  const command = new Command("notifySubscriptions");
  command.description("Generated notifySubscriptions commands.");

  const onNewNotificationCommand = command.command("on-new-notification");
  onNewNotificationCommand.description("notifySubscriptions onNewNotification");
  onNewNotificationCommand.option("--json", "Emit JSON output");
  onNewNotificationCommand.option("--watch", "Stream subscription events as JSON lines");
  onNewNotificationCommand.action(async (options) => {
    try {
      if (options.watch === true) {
        await subscriptionClient().notifySubscriptions.onNewNotification({
          signal: abortSignalFromInterrupt(),
          onEvent: (event) => console.log(JSON.stringify(event)),
        });
        return;
      }
      throw new Error("notifySubscriptions.onNewNotification is a stream. Use --watch to consume JSON-line events.");
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

function subscriptionClient() {
  const caller = createSubscriptionEventApiCallerFromEnv();
  if (!caller) {
    throw new Error("Subscription event API caller is not configured. Set FULCRUM_SERVER_URL, FULCRUM_ORG_ID, and FULCRUM_USER_ID.");
  }
  return caller;
}

function abortSignalFromInterrupt(): AbortSignal {
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  return controller.signal;
}
